# Canvas Reference Bridge 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-canvas-reference-bridge/canvas-reference-bridge-design.md`
> 用户终审：待用户确认；本报告已完成自动化测试、构建和浏览器 smoke 验证

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `CanvasNodeMetadata.referenceImageId/historyItemId/storagePath` 已落到 `src/shared/types.ts`，图片节点可保留 reference/history 来源绑定。
- [x] `CanvasImageNodeInput` 已在 `src/store/canvas-store.ts` 扩展 `referenceImageId/historyItemId/storagePath`，创建 image node 时会写入 metadata。
- [x] `useAppStore.addHistoryToCanvas(historyId)` 已落到 `src/store/app-store.ts`，负责 history -> reference -> Canvas node 的跨 store 编排。
- [x] Canvas toolbar 的“加入参考图”入口已落到 `src/components/canvas/CanvasWorkspace.tsx`，只读取当前 active conversation 的 `referenceImages`。
- [x] 历史图卡片“加入 Canvas”入口已落到 `src/components/workspace/ImageTile.tsx`，成功图更多菜单可调用 `addHistoryToCanvas(item.id)`。

**名词层“现状 -> 变化”逐项核对**

- [x] Canvas image node 从“只保存本地 data URL 图片”扩展为“可绑定当前会话 reference/history 来源的展示图片节点”。
- [x] `metadata.content` 仍是展示源；合法展示源从 `data:image/` 放宽为 data URL、http(s)、asset、blob、browser-memory 和本地路径。
- [x] `referenceImageId` 是后续 Canvas 生成输入解析的主绑定，`historyItemId` 只作为来源追溯。
- [x] 同一 project 内重复加入相同 `referenceImageId` 或 `historyItemId` 不重复创建节点。

**流程图核对**

- [x] 当前会话参考图 -> `CanvasWorkspace` 下拉选择 -> `imageSourceForDisplay()` -> `useCanvasStore.addImageNode()` -> `CanvasProjectService` normalize/persist 均有代码落点。
- [x] 历史 `ImageTile` -> `addHistoryToCanvas(historyId)` -> `pixaiApi.reference.addFromHistoryMany()` -> 更新 conversation.referenceImages -> `ensureDefaultProject()` -> `addImageNode()` -> `set({ view: 'canvas' })` 均有代码落点。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] Canvas toolbar 在当前会话有参考图时提供“加入参考图”菜单，选择后创建带 `metadata.referenceImageId` 的 image node：`src/components/canvas/CanvasWorkspace.test.tsx` 覆盖。
- [x] 历史成功图更多菜单提供“加入 Canvas”，点击后调用 app-store action：`src/components/workspace/ImageTile.test.tsx` 覆盖。
- [x] 从 history 加入 Canvas 会先导入当前会话参考图，再创建同时带 `historyItemId` 和 `referenceImageId` 的 image node，并切换到 Canvas：`src/store/app-store.test.ts` 覆盖。
- [x] Canvas project 重新读取后保留 `referenceImageId/historyItemId/storagePath`：`src/services/canvas-projects.test.ts` 覆盖。
- [x] 同一 reference/history 重复加入不重复创建节点：`src/store/canvas-store.test.ts` 覆盖。

**明确不做逐项核对**

- [x] 不新增 Canvas generate 节点或发起图片生成。源码中 `CanvasNodeType` 仍为 `'text' | 'image'`，Canvas 组件未调用 `pixaiApi.image.generate`。
- [x] 不修改 `GenerateImageInput`、`ImageService` 或 provider adapter 的生成输入契约；本单元只桥接 reference/history 到 Canvas image node。
- [x] 不新增 `ReferenceImage` / `ImageHistoryItem` 持久化字段，仍复用现有 reference/history 数据结构。
- [x] 不改变“作为参考图编辑”的现有行为；`ImageTile` 仅追加一个菜单项。
- [x] 不做 Canvas 节点删除时同步删除会话参考图；delete node 仍只影响 Canvas project。

**关键决策落地**

- [x] D1 不新增 reference node / history node 类型，来源绑定仍挂在 `CanvasNodeData(type: 'image')` 的 metadata 上。
- [x] D2 `metadata.content` 继续作为展示源，service normalize 只过滤不可展示空源，不再只接受 `data:image/`。
- [x] D3 history 加入 Canvas 必须通过 `reference.addFromHistoryMany`，没有绕过参考图数量、格式、大小限制。
- [x] D4 ImageTile 的“加入 Canvas”走 `useAppStore.addHistoryToCanvas()`，集中处理当前会话、reference 导入、Canvas project 和 toast。
- [x] D5 Canvas toolbar 的“加入参考图”只读取当前 active conversation，不跨会话拿素材。

**流程级约束核对**

- [x] 无 active conversation 时 `addHistoryToCanvas()` 提示“请先选择一个会话”，不创建 Canvas node。
- [x] history item 必须是 `succeeded` 且有 `dataUrl` 或 `storagePath`；不可用历史图提示失败并返回。
- [x] 参考图 / 历史图无可展示源时不创建 Canvas 节点。
- [x] 同一 project 内相同 `referenceImageId` 或 `historyItemId` 的 image node 不重复创建。
- [x] 当前会话参考图上限仍由 `reference.addFromHistoryMany` 维护，app-store 不另开旁路。

**挂载点反向核对**

- [x] `src/shared/types.ts`：Canvas image metadata 来源绑定字段。
- [x] `src/services/canvas-projects.ts`：Canvas image metadata normalize 和展示源合法性。
- [x] `src/store/canvas-store.ts`：Canvas image node input 扩展和 reference/history 去重。
- [x] `src/components/canvas/CanvasWorkspace.tsx`：从当前会话参考图加入 Canvas 的入口。
- [x] `src/store/app-store.ts`：从 history 加入 Canvas 的编排 action。
- [x] `src/components/workspace/ImageTile.tsx`：历史图卡片“加入 Canvas”入口。
- [x] 反向 grep：`referenceImageId/historyItemId/addHistoryToCanvas/加入 Canvas/加入参考图` 的业务命中集中在上述挂载点与对应测试内；额外 `storagePath` 命中属于既有图片展示/下载/存储支持，不是本 feature 的清单外桥接。
- [x] 拔除沙盘推演：逆向移除 metadata 字段、canvas-store 输入字段、CanvasWorkspace 下拉、app-store action 和 ImageTile 菜单后，本 feature 能力会消失；Canvas project shell/basic nodes、经典“作为参考图编辑”和 partial preview 可独立保留。

## 3. 验收场景核对

- [x] **S1**：当前会话有参考图时，Canvas toolbar “加入参考图”菜单可见；选择一张后 Canvas 出现 image node，metadata 有 `referenceImageId`。
  - 证据来源：`src/components/canvas/CanvasWorkspace.test.tsx` + 浏览器 smoke。
  - 结果：通过。
- [x] **S2**：同一参考图重复加入 Canvas，节点数量不增加。
  - 证据来源：`src/store/canvas-store.test.ts`。
  - 结果：通过。
- [x] **S3**：Canvas project 重新读取后，image node 的 `referenceImageId/historyItemId/storagePath` 仍保留。
  - 证据来源：`src/services/canvas-projects.test.ts`。
  - 结果：通过。
- [x] **S4**：历史成功图点击“加入 Canvas”：当前会话新增参考图，Canvas 出现 image node，metadata 同时有 `historyItemId` 和 `referenceImageId`，视图切到 Canvas。
  - 证据来源：`src/store/app-store.test.ts`。
  - 结果：通过。
- [x] **S5**：历史失败图或没有图片源的 history item 不创建 Canvas 节点。
  - 证据来源：`src/store/app-store.test.ts` 与 `ImageTile` 成功态菜单渲染条件。
  - 结果：通过。
- [x] **S6**：当前会话已满 8 张参考图时从 history 加入 Canvas，沿用现有参考图上限错误，不创建 Canvas 节点。
  - 证据来源：`addHistoryToCanvas()` 先调用 `pixaiApi.reference.addFromHistoryMany(activeConversationId, [historyId])`，异常进入 catch toast；不在 app-store 绕过 reference service。
  - 结果：通过。
- [x] **S7**：data URL、browser-memory 路径、asset/http(s) 展示源的 image node 不会被 CanvasProjectService 误过滤。
  - 证据来源：`src/services/canvas-projects.test.ts`。
  - 结果：通过。

**前端浏览器验证**

- [x] `pnpm vitest run src/services/canvas-projects.test.ts src/store/canvas-store.test.ts src/components/canvas/CanvasWorkspace.test.tsx src/store/app-store.test.ts src/components/workspace/ImageTile.test.tsx`：5 files / 37 tests passed。
- [x] `pnpm check`：30 files / 149 tests passed。
- [x] `pnpm build`：生产构建通过；Vite 仍提示单 chunk 超过 500 kB，这是既有构建体积提示。
- [x] Chrome headless smoke：打开本地 Vite 页面，验证 Canvas reference dropdown 与 history 加入 Canvas 入口，截图证据为 `.codestable/features/2026-06-05-canvas-reference-bridge/canvas-reference-bridge-smoke.png`。

## 4. 术语一致性

- Canvas reference image node：源码以 `CanvasNodeData(type: 'image')` + `metadata.referenceImageId` 表达，没有新增并行 node type。
- Canvas history image node：源码以 `metadata.historyItemId` + `metadata.referenceImageId` 表达，history 只是来源追溯。
- Display image source：源码继续以 `metadata.content` / `dataUrl` 作为 image node 展示源，`imageSourceForDisplay()` 负责把 data/storage/local 路径解析为可展示源。
- Reference binding：源码以 `referenceImageId` 表达，后续生成节点可直接读取该绑定。
- 防冲突：`ImageTile` 的“作为参考图编辑”仍保留原语义，“加入 Canvas”是并列菜单项。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已补充 Canvas 模式支持从当前会话 referenceImages 创建绑定 image node，以及从历史成功图经 reference 导入后创建 Canvas image node。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已在数据与状态中记录 `referenceImageId/historyItemId/storagePath` metadata、非 data URL 展示源 normalize 和 reference/history 去重约束。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已记录 `ImageTile` “加入 Canvas”入口与 `useAppStore.addHistoryToCanvas()` 编排边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已把 Canvas project shell / basic nodes 摘要扩展为包含 reference/history image node bridge，并把硬边界更新为“仍不接 Canvas 生成节点或 DAG 执行器”。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement` 为空。
- [x] 本 feature 是 `workspace-canvas-mode` roadmap 下的 Canvas/reference 互通实现单元；不新增独立用户愿景文档。
- [x] `reference-image-input` 当前仍描述输入区粘贴、拖入和 URL 导入，不改变其 pitch、用户故事或边界。
- [x] 结论：无 requirement 回写。

## 7. roadmap 回写

- [x] 方案 frontmatter 指向 `roadmap: workspace-canvas-mode` / `roadmap_item: canvas-reference-bridge`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-items.yaml`：`canvas-reference-bridge` 已由 `in-progress` 改为 `done`，保留 `feature: 2026-06-05-canvas-reference-bridge`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-roadmap.md`：第 5 节子 feature 清单已同步为 `状态：done` / `对应 feature：2026-06-05-canvas-reference-bridge`。
- [x] YAML 校验：`workspace-canvas-mode-items.yaml` 和 `canvas-reference-bridge-checklist.yaml` 均通过 `validate-yaml.py --yaml-only`。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露新的项目常驻事项。真实 Tauri 客户端测试命令和 browser smoke 注意事项沿用既有记录，不重复写入。

## 9. 遗留

- 后续优化点：跨会话 gallery 素材加入 Canvas 的语义仍默认使用当前 active conversation / Canvas project，后续 `canvas-history-gallery-integration` 可进一步细化来源提示和项目选择。
- 后续优化点：`src/store/app-store.ts` 继续承担 history/reference/Canvas 跨 store 编排；后续若 Canvas 生成桥继续扩大，可单独走 `cs-refactor` 拆 orchestration slice。
- 已知限制：本 feature 不生成图片，不解析 Canvas 连线作为生成输入，只为后续 `canvas-generate-node` 提供 reference binding。
- 实现阶段顺手发现：无需要单独沉淀到 attention.md 的环境或命令问题。
