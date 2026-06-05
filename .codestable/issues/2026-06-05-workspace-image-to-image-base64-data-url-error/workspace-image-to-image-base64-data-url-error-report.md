---
doc_type: issue-report
issue: 2026-06-05-workspace-image-to-image-base64-data-url-error
status: active
severity: P1
summary: 经典工作台在携带参考图执行图生图时，会以“图片数据必须是 base64 data URL”失败
tags: [workspace, image-to-image, reference-image, generation, tauri]
---

# Workspace Image-To-Image Base64 Data URL Error Issue Report

## 1. 现象

在经典工作台中，当当前会话已经挂载参考图并执行图生图时，生成请求会失败，失败历史中的错误详情显示：

`图片数据必须是 base64 data URL。`

这次问题不是出现在 Canvas 工作台，而是发生在普通工作台的图生图链路里。当前测试会话中挂了两张参考图，文生图成功，但切到图生图后会稳定失败。

## 2. 复现路径

1. 打开经典工作台。
2. 进入当前测试会话 `conversation_3b85cf45-6889-4e4e-9385-45c11db61689`。
3. 保持当前两张参考图：
   - `reference_2ed76bae-ec35-462e-86af-73f423924535`
   - `reference_11eb3511-5287-40f4-83da-995d36e50e8d`
4. 输入提示词“生成一只猫”。
5. 以当前参数发起生成：
   - `model: gpt-image-2`
   - `ratio: 1:1`
   - `size: 1024x1024`
   - `quality: high`
   - `stream: false`
6. 查看本次失败历史项的错误详情。

观察到：

- 本次生成失败。
- 失败历史项 `errorDetails` 中记录的错误信息为：`图片数据必须是 base64 data URL。`
- 当 provider 返回的生成结果是远程 `image.url`，而不是 `b64_json` 时，落盘阶段失败。

复现频率：稳定。2026-06-05 14:38:31 和 2026-06-05 14:41:59 各出现过一次相同失败记录。

## 3. 期望行为

在经典工作台里，只要当前会话的参考图显示正常且可选中，图生图请求就应正常执行并返回结果。

provider 返回远程图片 URL 时，应用应先把 URL 下载并归一化为 base64 data URL，再进入现有图片持久化链路，最终成功写入历史记录。

## 4. 影响范围

影响所有复用 `ImageService.generate()` 且 provider 可能返回 `image.url` 的生成路径；不局限于某一个会话。

## 5. 环境信息

- 涉及模块 / 功能：经典工作台；参考图挂载后的图生图生成链路。
- 运行环境：本地开发环境，PixAI Dev（`pnpm dev:client`）。
- 当前查看的运行时状态文件为 `C:\Users\admin\AppData\Local\com.fingercaster.pixai.tauri.dev\pixai-data.json`。
- 当前会话中的两张参考图都来自历史图。
- 当前线程的 `.tauri-dev.out.log` / `.tauri-dev.err.log` 没有直接打印这次失败细节，错误细节主要来自失败历史记录。

## 6. 严重程度

**P1** — 经典工作台的图生图主链路在当前场景下稳定失败，已直接影响核心生成能力，但文生图仍可使用。
