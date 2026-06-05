---
doc_type: issue-fix
issue: 2026-06-06-responses-stream-upstream-error
path: fast-track
fix_date: 2026-06-06
tags: [responses-api, image-generation, provider-error]
---

# Responses stream upstream error 修复记录

## 1. 问题描述

经典工作台使用 `responses-api` 端点生成图片时，调用日志显示 HTTP 状态码为 200，但 SSE payload 中先出现 `type: "error"`，最终出现 `type: "response.failed"`：

- provider: AIO / `https://ai.input.im/v1/responses`
- image model: `gpt-image-2`
- prompt model: `gpt-5.4-mini`
- provider error: `upstream_error` / `Upstream request failed`

旧逻辑没有识别 HTTP 200 内部的 Responses SSE 失败，最终报成通用的“Responses 图像工具没有返回可识别的图片”。

## 2. 根因

`src/adapters/openai-compatible.ts` 的 Responses 图像工具路径只在 HTTP 非 2xx 时使用 `getProviderErrorMessage`。当 provider 通过 HTTP 200 返回 SSE，并在事件流内部发送 `type: "error"` 或 `type: "response.failed"` 时，适配器只统计最终图片结果；如果没有图片，就抛出通用的“没有返回可识别的图片”。

另外，`response.failed.response.error` 里的错误对象可能只有 `code/message`，没有 `type: "error"` 外壳，原有 `extractProviderError` 无法稳定提取这类错误。

## 3. 修复方案

- 在 Responses 图像工具路径中新增 SSE provider error 提取。
- 支持 `type: "error"`、`type: "response.failed"` 下的 `response.error`，以及仅含 `code/message` 的错误对象。
- 当没有最终图片且存在 provider error 时，抛出 `ProviderHttpError`，主错误直接显示 provider 的 `message/code`。
- `responseSummary` 增加 `providerError`，保留排障证据。
- 本次不改变请求体结构；用户日志里的真实外部失败仍是 AIO 上游返回的 `upstream_error`，本地只修诊断和错误归类。

## 4. 改动文件

- `src/adapters/openai-compatible.ts`
- `src/adapters/openai-compatible.test.ts`

## 5. 验证结果

- `pnpm vitest run src/adapters/openai-compatible.test.ts`
- `pnpm vitest run src/lib/platform.test.ts src/services/image-service.test.ts src/adapters/openai-compatible.test.ts`
- `pnpm check`
- `cargo check`

新增覆盖：

- HTTP 200 + `type:error` + `response.failed` 时，主错误为 `Upstream request failed（upstream_error）`，details 保留 `providerError`。

## 6. 遗留事项

该日志中的 AIO 上游确实返回了 `upstream_error`。本修复只保证本地诊断和错误归类准确；若要继续追上游兼容性，需要对照 AIO 对 `gpt-image-2` + Responses image_generation tool 的支持情况。
