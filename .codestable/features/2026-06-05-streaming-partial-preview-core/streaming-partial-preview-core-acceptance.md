# Streaming Partial Preview Core 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：.codestable/features/2026-06-05-streaming-partial-preview-core/streaming-partial-preview-core-design.md

## 1. 接口契约核对

**接口示例逐项核对**：

- [x] `PartialImagePreview` / `GenerationPreviewState`：已在 `src/shared/types.ts` 落地，包含 `runId`、`requestIndex`、可选 `partialImageIndex`、`dataUrl`、`receivedAt`。
- [x] `ImageGenerationRequest.onPartialImage`：已在 `src/adapters/types.ts` 落地，adapter 只传 `ImageApiData` 和可选 index，不携带 run 语义。
- [x] `PlatformFetchOptions.onTextChunk`：已在 `src/lib/platform.ts` 落地，浏览器和 Tauri stream helper 都会逐 chunk 安全触发。
- [x] `ImageGenerationOptions`：已在 `src/services/image-service.ts` 落地，`src/services/app-api.ts` 的 `pixaiApi.image.generate(input, options?)` 保持现有调用兼容。

**名词层“现状 → 变化”逐项核对**：

- [x] shared 类型：从无 preview 类型变为显式临时 preview 契约。
- [x] adapter request：从只有 call log 诊断回调变为同时支持 partial image 回调。
- [x] platform stream：从完整文本一次性返回变为 chunk callback + 完整文本返回并存。
- [x] app store/UI：从只显示 spinner 变为有 preview 时显示中间图。

**流程图核对**：

- [x] platform chunk → adapter parser → ImageService → app store → `CanvasArea` → `GeneratingTile` 均有实际代码落点。
- [x] 完整 text → 最终图片解析 → history 落库仍走原有 `ImageService` 路径。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 经典工作台生成占位支持 partial preview：`CanvasArea.test.tsx` 覆盖 running slot 渲染 preview image。
- [x] 不支持 partial 的 provider 保持 spinner：`GeneratingTile` 仅在传入 `preview` 时渲染 `<img>`，否则保留原 spinner 结构。

**明确不做逐项核对**：

- [x] 未新增 Canvas 生成节点、result 节点或 DAG 执行入口。
- [x] 未把 partial preview 写入 history、reference、gallery 或 Canvas project。
- [x] 未改变 `GenerateImageInput` 持久化字段；函数回调只存在于 service-only options。
- [x] 未新增 provider 设置项或环境变量。

**关键决策落地**：

- [x] `PartialImagePreview` 作为 shared type 落地，供 store/UI/后续 Canvas 复用。
- [x] adapter 不知道 `runId`，ImageService 在 requestIndex 闭包里补齐 run/request 语义。
- [x] platform 不理解 SSE，只暴露文本 chunk；SSE 解析留在 provider adapter。
- [x] partial payload 被最终图片提取过滤，避免中间图进入 history。

**流程级约束核对**：

- [x] `onTextChunk` 和 `onPartialImage` 都有 try/catch 保护，observer 异常不打断生成。
- [x] SSE parser 只处理完整 block，未完成 buffer 在 flush 时兜底处理。
- [x] data URL 为空时 ImageService 不写 preview。
- [x] run 完成、失败或取消后按 run/request 清理 preview，不影响其他 run。

**挂载点反向核对**：

- [x] 挂载点均落在 design 第 2.3 节清单：shared types、platform、adapter、ImageService/app-api、app-store、CanvasArea/GeneratingTile。
- [x] 反向 grep：`PartialImagePreview`、`generationPreviews`、`onPartialImage` 未出现在 Canvas project/history/reference/gallery 持久化代码中。
- [x] 拔除沙盘推演：移除上述挂载点后，partial preview 能力消失；最终生成、history 和 Canvas basic nodes 不依赖该临时状态。

## 3. 验收场景核对

- [x] 浏览器 stream 多 chunk：`src/lib/platform.test.ts` 覆盖 `fetchTextStreamThroughPlatform` chunk callback 和完整 text。
- [x] Tauri stream proxy 多 chunk：`src/lib/platform.test.ts` 覆盖 `fetchMultipartTextStreamThroughPlatform` chunk callback 和完整 text。
- [x] images endpoint partial：`src/adapters/openai-compatible.test.ts` 覆盖 `image_generation.partial_image`，最终 completed 图独立返回。
- [x] image edits partial：`src/adapters/openai-compatible.test.ts` 覆盖 `image_edit.partial_image`。
- [x] responses partial：`src/adapters/openai-compatible.test.ts` 覆盖 `response.image_generation_call.partial_image`。
- [x] store 写入/清理：`src/store/app-store.test.ts` 覆盖生成中写入 `generationPreviews`、完成后清理。
- [x] ImageService 语义补齐：`src/services/service-routing.test.ts` 覆盖 preview 带 `runId/requestIndex/partialImageIndex/dataUrl`。
- [x] UI 展示：`src/components/workspace/CanvasArea.test.tsx` 覆盖 `GeneratingTile` 渲染 preview image。
- [x] 浏览器肉眼验证：Chrome headless 渲染 smoke harness 并截图，文件为 `.codestable/features/2026-06-05-streaming-partial-preview-core/streaming-partial-preview-core-smoke.png`。

验证命令：

- [x] `pnpm vitest run src/lib/platform.test.ts src/adapters/openai-compatible.test.ts src/services/service-routing.test.ts src/store/app-store.test.ts src/components/workspace/CanvasArea.test.tsx`：5 files / 56 tests passed。
- [x] `pnpm check`：30 files / 145 tests passed。
- [x] `pnpm build`：通过，仅保留既有 Vite chunk size warning。

## 4. 术语一致性

- `PartialImagePreview`：shared type、service options、store state、UI props 命名一致。
- `GenerationPreviewState`：只表示 `runId -> requestIndex -> preview` 临时字典，不与 history/run 混名。
- `onPartialImage`：adapter request 与 service options 的概念一致，但职责不同；adapter 传 provider image，service 传业务 preview。
- `generationPreviews`：只存在于 app store/UI/test，不进入 Canvas store 或 database。

防冲突核对：

- [x] `partial preview` 未被引入为新的持久化实体。
- [x] `CanvasArea` 的历史命名未在本 feature 中重命名，避免混入方案外改动。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：补充“流式 partial preview”术语、流式预览链路模块索引、分层关键决策和临时状态约束。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：补充经典工作台 partial preview 展示、`generationPreviews` 数据状态、platform/adapter/service/store/UI 交互和代码锚点。

归并后，未读 design 的维护者可以从 architecture 看到：partial preview 是临时 UI 状态；平台只管 chunk，adapter 管 SSE，ImageService 补业务语义，store/UI 展示和清理。

## 6. requirement 回写

- [x] 本 feature frontmatter `requirement` 为空，且是 roadmap 内部能力实现单元；不新增独立 requirement。
- [x] `reference-image-input` 没有用户故事或边界变化，不回写。

## 7. roadmap 回写

- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-items.yaml` 中 `streaming-partial-preview-core` 已从 `in-progress` 改为 `done`，feature 指向 `2026-06-05-streaming-partial-preview-core`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-roadmap.md` 主文档第 5 节对应条目已同步为 `done`。
- [x] `validate-yaml.py` 校验 roadmap items 通过。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 `.codestable/attention.md` 的新常驻注意事项。

补充记录：browser-bridge 扩展当前没有连接到 Chrome tab；验收改用本机 Chrome headless 截图，不属于每个 feature 都会撞到的项目规则，因此不写 attention。

## 9. 遗留

- 后续优化点：app-store 继续膨胀时，可单独走 `cs-refactor` 拆 generation slice；本 feature 不做。
- 已知限制：partial preview 只在经典工作台展示，Canvas 生成节点复用留给 roadmap 后续 `canvas-generate-node`。
- 已知限制：只识别 roadmap 指定的三类 partial event；更多 provider schema 差异后续按实际 provider 追加。
- 实现阶段顺手发现：无。
