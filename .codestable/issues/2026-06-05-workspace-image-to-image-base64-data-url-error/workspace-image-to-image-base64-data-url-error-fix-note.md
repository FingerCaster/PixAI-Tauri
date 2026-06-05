---
doc_type: issue-fix
issue: 2026-06-05-workspace-image-to-image-base64-data-url-error
path: standard
fix_date: 2026-06-06
related: [workspace-image-to-image-base64-data-url-error-report.md, workspace-image-to-image-base64-data-url-error-analysis.md]
tags: [workspace, image-to-image, reference-image, generation, tauri]
---

# Workspace Image-To-Image Base64 Data URL Error 修复记录

## 1. 实际采用方案

采用 analysis 确认的方案 A：

- `src/lib/platform.ts` 新增远程图片下载与 browser fallback。
- `src-tauri/src/lib.rs` 新增 `read_remote_image_url` command，支持 HTTP/HTTPS、PNG/JPG/WEBP、20MB 限制。
- `src/services/image-service.ts` 在落盘前把普通 `image.url` 转成 base64 data URL。
- 把 `succeededCount += 1` 后移到图片落盘和成功 history 写入完成之后，避免“历史失败但 run 仍显示成功”。

## 2. 改动文件

- `src/lib/platform.ts`
- `src-tauri/src/lib.rs`
- `src/services/image-service.ts`
- `src/lib/platform.test.ts`
- `src/services/image-service.test.ts`

## 3. 验证结果

- `pnpm vitest run src/lib/platform.test.ts src/services/image-service.test.ts src/adapters/openai-compatible.test.ts`
- `pnpm check`
- `cargo check`

合并 main 前的定向验证还包括：

- `pnpm vitest run src/services/image-service.test.ts`
- `pnpm vitest run src/services/service-routing.test.ts src/lib/platform.test.ts`

新增覆盖：

- browser runtime 下远程图片 URL 会被下载成 base64 data URL。
- provider 返回远程 `image.url` 时，`ImageService.generate()` 会先下载再保存成功历史。
- 如果图片已经生成，但成功 history 写入失败，run 状态会保持 `failed`，不再提前计入成功。

## 4. 遗留事项

还需要在真实 Tauri 开发客户端中，用现场两张参考图或 `conversation_3b85cf45-6889-4e4e-9385-45c11db61689` 重跑一次经典工作台图生图，确认历史里不再出现 `图片数据必须是 base64 data URL。`
