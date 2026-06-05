# Canvas History Gallery Integration 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-canvas-history-gallery-integration/canvas-history-gallery-integration-design.md`
> 用户终审：待用户确认；本报告已完成自动化测试、构建和 Chrome headless smoke 验证

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `GenerationOrigin = { kind: 'workspace' } | { kind: 'canvas'; canvasProjectId; canvasNodeId }` 已落到 `src/shared/types.ts`。
- [x] `GenerateImageInput.origin`、`GenerationRun.origin`、`ImageHistoryItem.origin` 均为可选字段，旧调用缺省不受影响。
- [x] `src/shared/generation-origin.ts` 提供 normalize、Canvas 判定和来源搜索文本，供 service/database/UI 共用。

**名词层“现状 -> 变化”逐项核对**

- [x] `ImageService` 创建 run、成功 history 和失败 history 时会透传合法 origin。
- [x] `AppDatabase` 读取 legacy data 时兼容缺 origin 的旧记录，并清理非法 Canvas origin。
- [x] `generateCanvasNode()` 构造 `GenerateImageInput` 时写入 `{ kind: 'canvas', canvasProjectId: project.id, canvasNodeId: nodeId }`。
- [x] `ImageTile` 在成功卡和失败卡中显示 Canvas 来源 badge。
- [x] `GalleryPage` 和 `AppDatabase.listHistory()` 都把 `canvas` / `画布` 来源关键词纳入搜索文本。

**流程图核对**

- [x] Canvas generate node -> `generateCanvasNode` origin -> `pixaiApi.image.generate` -> `ImageService` -> `insertRun/insertHistory` -> `AppDatabase.listHistory` -> `GalleryPage` / `ImageTile` 均有实际代码落点。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] Canvas 生成请求携带 origin：`src/store/app-store.test.ts` 覆盖。
- [x] 成功 run/history 保留 Canvas origin：`src/services/image-service.test.ts` 覆盖。
- [x] 失败 history 保留 Canvas origin：`src/services/image-service.test.ts` 覆盖。
- [x] 旧数据缺 origin 或非法 Canvas origin 可兼容：`src/services/image-service.test.ts` 中的 `AppDatabase generation origin normalization` 覆盖。
- [x] Gallery / ImageTile 显示 Canvas badge，成功/失败卡片均可见：`src/components/workspace/ImageTile.test.tsx` 覆盖。
- [x] Gallery 搜索 `canvas` / `画布` 可命中 Canvas-origin item：service test 和 `src/components/gallery/GalleryPage.test.tsx` 覆盖。
- [x] 成功图更多菜单“加入 Canvas”继续调用 `addHistoryToCanvas(historyId)`：`src/components/workspace/ImageTile.test.tsx` 覆盖。

**明确不做逐项核对**

- [x] 未新增 history/gallery 跳转 Canvas project/node。
- [x] 未新增 Canvas 专用 history 表或素材表。
- [x] 未改变 classic workspace `generate()` / `retryHistory()` 的 origin 语义；`retryHistory` 测试确认不传 origin。
- [x] 未改变 Canvas project 保存结构，也没有把完整 history 复制进 Canvas project。
- [x] 未做批量加入 Canvas、项目导入导出或 DAG 执行。

**关键决策落地**

- [x] D1 `GenerationOrigin` 是 shared type，并挂到 GenerateImageInput / GenerationRun / ImageHistoryItem。
- [x] D2 `origin` 缺省即 classic workspace；classic `generate()` / `retryHistory()` 不主动传 `workspace`。
- [x] D3 `ImageService.generate()` 规范化一次 origin，再写 run/history。
- [x] D4 `AppDatabase.normalizeData()` 负责旧数据兼容与非法 origin 清理。
- [x] D5 来源展示集中在 `ImageTile`，Gallery 和经典工作台复用同一张卡片。
- [x] D6 Gallery 本地 filter 和数据库 `listHistory()` 都使用来源搜索文本。

**流程级约束核对**

- [x] 旧数据没有 origin 时不会被当成 Canvas 来源。
- [x] Canvas origin 缺 project/node id 时 normalize 后删除。
- [x] origin 只作为 run/history 指针，不影响 referenceImages 或 Canvas project。
- [x] classic retry 不继承 Canvas origin。
- [x] 来源 badge 在 smoke 截图中不遮挡图片或按钮。

**挂载点反向核对**

- [x] `src/shared/types.ts`：GenerationOrigin 和可选 origin 字段。
- [x] `src/shared/generation-origin.ts`：normalize / label / search helper。
- [x] `src/services/image-service.ts`：run/history 透传 origin。
- [x] `src/services/app-database.ts`：legacy normalize 和 history query。
- [x] `src/store/app-store.ts`：Canvas generate origin。
- [x] `src/components/workspace/ImageTile.tsx`：Canvas badge 和加入 Canvas 菜单保持。
- [x] `src/components/gallery/GalleryPage.tsx`：来源关键词本地过滤。
- [x] 反向 grep：`GenerationOrigin` / `generationOriginSearchText` / `isCanvasGenerationOrigin` 命中集中在上述挂载点与测试内。
- [x] 拔除沙盘推演：移除 shared origin 类型/helper、service/database origin 透传、app-store Canvas origin 和 UI badge/filter 后，本 feature 消失；Canvas project、reference bridge 和生成节点基础功能仍可独立保留。

## 3. 验收场景核对

- [x] **S1**：Canvas 生成节点触发成功生成，生成请求收到 Canvas origin，成功 history item 与 run 都保留该 origin。
  - 证据来源：`src/store/app-store.test.ts`、`src/services/image-service.test.ts`。
  - 结果：通过。
- [x] **S2**：Canvas 生成节点请求失败并落失败 history，失败 history item 保留 Canvas origin。
  - 证据来源：`src/services/image-service.test.ts`。
  - 结果：通过。
- [x] **S3**：经典工作台生成不显示 Canvas 来源 badge，history 查询行为保持原样。
  - 证据来源：classic generate/retry 未传 origin；`retryHistory` 测试确认无 origin。
  - 结果：通过。
- [x] **S4**：旧 history/run 数据缺 `origin` 或非法 Canvas origin 时，读取、列表、搜索不报错。
  - 证据来源：`AppDatabase generation origin normalization` 测试。
  - 结果：通过。
- [x] **S5**：Gallery 搜索 `canvas` 或 `画布` 可命中 Canvas-origin history item，普通关键词仍按 prompt/model/size 工作。
  - 证据来源：service test、Gallery component test、Chrome smoke。
  - 结果：通过。
- [x] **S6**：ImageTile 成功卡和失败卡都显示 Canvas badge；成功卡更多菜单“加入 Canvas”仍调用 `addHistoryToCanvas(historyId)`。
  - 证据来源：`src/components/workspace/ImageTile.test.tsx`。
  - 结果：通过。

**前端浏览器验证**

- [x] 定向测试：`pnpm vitest run src/services/image-service.test.ts src/store/app-store.test.ts src/components/workspace/ImageTile.test.tsx src/components/gallery/GalleryPage.test.tsx`，4 files / 35 tests passed。
- [x] `pnpm check`：31 files / 161 tests passed。
- [x] `pnpm build`：生产构建通过；Vite 仍提示单 chunk 超过 500 kB，这是既有构建体积提示。
- [x] Chrome headless smoke：截图证据 `.codestable/features/2026-06-05-canvas-history-gallery-integration/canvas-history-gallery-integration-smoke.png`，可见 Gallery 搜索“画布”后只显示 Canvas-origin item，且卡片显示 `Canvas` badge。

## 4. 术语一致性

- Generation origin：源码使用 `GenerationOrigin`、`normalizeGenerationOrigin`。
- Canvas-origin history item：源码表现为 `ImageHistoryItem.origin.kind === 'canvas'`。
- Canvas origin badge：源码 class `canvas-origin-badge`，可见文本 `Canvas`。
- Gallery source search：`generationOriginSearchText()` 同时服务 database query 和 Gallery filter。
- History fact source：Canvas project 仍只保存 run/history binding，没有复制完整 history。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已补充 Generation origin、Canvas-origin history item、ImageTile Canvas badge、Gallery 来源搜索、run/history 可选 origin 和 normalize 兼容。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已把旧边界“Canvas origin history schema 未支持”改为“已支持来源标识，但不支持 Gallery 跳回 Canvas 节点 / 节点级重试”。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已更新 Canvas 模式摘要、模块索引、关键决定和硬边界。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement` 为空。
- [x] 本 feature 是 `workspace-canvas-mode` roadmap 下的 history/gallery 集成单元，不新增独立 requirement。
- [x] `reference-image-input` 没有用户故事或边界变化，不回写。

## 7. roadmap 回写

- [x] 方案 frontmatter 指向 `roadmap: workspace-canvas-mode` / `roadmap_item: canvas-history-gallery-integration`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-items.yaml`：`canvas-history-gallery-integration` 已由 `in-progress` 改为 `done`，保留 `feature: 2026-06-05-canvas-history-gallery-integration`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-roadmap.md`：第 5 节子 feature 清单已同步为 `状态：done` / `对应 feature：2026-06-05-canvas-history-gallery-integration`。
- [x] roadmap 4.5 已更新为 Gallery 读取 history item 来源字段，Canvas binding 反查 / 跳转留后续 feature。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露新的项目常驻事项。真实 Tauri 客户端仍按既有 `pnpm dev:client` 注意事项执行；本次前端 smoke 使用临时 Vite + Chrome headless。

## 9. 遗留

- 后续优化点：Gallery 点击 Canvas badge / history item 跳回 Canvas project 和 generate node，需要单独设计 project 打开与节点定位协议。
- 后续优化点：Canvas 节点级重试不应复用 classic `retryHistory()` 的视图跳转语义，需要单独设计 run/history 到 node 的恢复流程。
- 已知限制：不支持自动 DAG 调度、批量节点运行、项目导入导出或配置节点。
- 实现阶段顺手发现：`app-store.ts` 继续偏胖；后续如果再加入 Canvas navigation / retry 编排，建议走 `cs-refactor` 拆 generation/canvas orchestration slice。
