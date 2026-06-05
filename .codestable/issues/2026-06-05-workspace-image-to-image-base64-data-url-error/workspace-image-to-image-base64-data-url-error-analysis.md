---
doc_type: issue-analysis
issue: 2026-06-05-workspace-image-to-image-base64-data-url-error
status: confirmed
root_cause_type: data-format
related: [workspace-image-to-image-base64-data-url-error-report.md]
tags: [workspace, image-to-image, reference-image, generation, tauri]
---

# Workspace Image-To-Image Base64 Data URL Error 根因分析

## 1. 问题定位

| 关键位置 | 说明 |
|---|---|
| `src/services/image-service.ts` | 请求拿到 `generated.image` 后，原先会先把本次请求计入成功，再把生成结果交给 `persistGeneratedImage()` 落盘。 |
| `src/services/image-service.ts` | `imageDataToDataUrl()` 在上游返回 `b64_json` 时会构造标准 data URL，但如果上游返回的是 `image.url`，这里会直接返回普通 URL 字符串。 |
| `src/services/image-service.ts` | `hydrateReferencesForRequest()` 会把带 `storagePath` 的参考图重新读成 base64 data URL，因此参考图输入侧并不是本次报错的直接根因。 |
| `src/adapters/openai-compatible.ts` | adapter 明确把上游返回的 `url` / `image_url` 识别为合法图片结果，说明 `ImageService` 必须兼容“输出是 URL 而不是 base64”的情况。 |
| `src-tauri/src/lib.rs` | `store_data_url_file` 在 Tauri 侧只接受 base64 data URL，然后立即调用 `decode_data_url()` 解码写盘。 |

因此，当 provider 返回普通 HTTP/HTTPS 图片 URL 时，`ImageService` 把它当作 data URL 传入 Tauri 写盘，最终触发 `图片数据必须是 base64 data URL。`

## 2. 失败路径还原

**正常路径**：经典工作台挂载参考图后发起图生图 -> `ImageService.generate()` 读取当前会话参考图 -> `hydrateReferencesForRequest()` 发现参考图有 `storagePath`，先把本地文件重新读成 base64 data URL -> adapter 发出图生图请求 -> 如果上游返回 `b64_json`，`imageDataToDataUrl()` 会构造标准 data URL -> `persistGeneratedImage()` 成功调用 Tauri `store_data_url_file` 落盘 -> history item 写入成功。

**失败路径**：经典工作台挂载参考图后发起图生图 -> 参考图同样先被 `hydrateReferencesForRequest()` 正常转成 base64 data URL -> adapter 请求成功，且从上游结果中提取到了 `image.url` 类型的结果 -> `imageDataToDataUrl()` 直接把这个普通 URL 当作“dataUrl”返回 -> `persistGeneratedImage()` 把这个普通 URL 直接传给 `store_data_url_file` -> Rust 侧 `decode_data_url()` 发现它不是 base64 data URL，于是抛出 `图片数据必须是 base64 data URL。` -> 外层 catch 把本次请求记成 failed history。

分叉点：当上游返回 `image.url` 时，当前实现没有在落盘前把远程 URL 规范化成可写盘的 base64 data URL。

## 3. 根因

**根因类型**：`data-format`

当前图生图链路对“输入参考图”和“输出生成图”的格式处理不一致。输入侧已经考虑到了 Tauri 运行时会把图片资产保存成文件路径，所以 `hydrateReferencesForRequest()` 会在真正发请求前把本地文件重新转回 base64 data URL；但输出侧只做了 `b64_json -> data URL` 的 happy path 处理，没有处理“provider 返回远程 URL”这种同样合法的结果类型。

- 主根因：输出落盘路径缺少对 `image.url` 结果的格式归一化。
- 次根因：成功计数在图片真正落盘并写入 history 之前发生，会把“上游已返回图片，但本地落盘失败”的请求提前记成成功，导致 run 状态和 history 状态可能不一致。

## 4. 修复方案

采用方案 A：在 `ImageService` 输出侧补做 URL -> data URL 归一化。

- 在 platform 层新增 `readRemoteImageUrl()` / Tauri `read_remote_image_url`，统一把 HTTP/HTTPS 图片下载成 `{ name, mimeType, dataUrl, fileSizeBytes }`。
- 在 `ImageService` 输出侧遇到普通 `image.url` 时，先调用 platform 下载，再把 base64 data URL 交给现有 `storeDataUrlFile()`。
- 把 `succeededCount += 1` 移到落盘和成功 history 写入之后，避免落盘失败时 run 被提前计成功。

推荐该方案的原因：改动集中在 `ImageService` 和 platform 边界，不需要放宽 `store_data_url_file` 的输入契约，也不会把历史记录持久化策略改成远程 URL 混合模式。

## 5. 边界

本修复只处理 provider 返回的生成结果 URL，不增加 prompt 自动解析远程图，也不改变参考图数据模型。

影响范围覆盖所有复用 `ImageService.generate()` 且 provider 可能返回 `image.url` 的图像生成路径，包括经典工作台图生图、Canvas 生成节点，以及任何切到 URL 结果的 OpenAI-compatible provider profile。
