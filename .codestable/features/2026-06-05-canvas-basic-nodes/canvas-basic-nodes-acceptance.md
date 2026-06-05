# Canvas Basic Nodes 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-canvas-basic-nodes/canvas-basic-nodes-design.md`
> 用户终审：待用户确认；本报告已完成自动化测试、构建和浏览器 smoke 验证

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `CanvasNodeData`、`CanvasNodeMetadata`、`CanvasConnection`、`CanvasConnectionKind` 已落到 `src/shared/types.ts`，当前只包含 `text` / `image` 节点和 `prompt` / `reference-image` 轻量连线。
- [x] `CanvasProject.nodes` / `connections` 从空数组升级为真实数组；`CanvasProjectInput` 支持更新 `nodes` / `connections`。
- [x] `CanvasProjectService.update()` 会持久化 nodes/connections，并在读取/更新时规范化节点和连线。
- [x] `useCanvasStore` 暴露 `addTextNode`、`addImageNode`、`updateNodeContent`、`moveNode`、`deleteNode`、`addConnection`、`deleteConnection`。

**名词层“现状 -> 变化”逐项核对**

- [x] Canvas project 从“空 viewport shell”升级为“viewport + text/image nodes + connections”。
- [x] 图片节点只保存 data URL payload，不新增 reference/history/gallery 素材实体。
- [x] 选择态留在 `CanvasNodeLayer` 组件局部，没有写入 project JSON。
- [x] 旧项目缺少 nodes/connections 时仍可加载为空数组，`canvas-projects.test.ts` 覆盖。

**流程图核对**

- [x] “添加文本/图片 -> useCanvasStore 更新 nodes -> pixaiApi.canvas.update -> CanvasViewport/CanvasNodeLayer 渲染 -> 拖动/编辑/连线/删除 -> 持久化”均有代码落点。关键 grep：`addTextNode`、`addImageNode`、`CanvasNodeLayer`、`data-canvas-node-type`、`addConnection`、`deleteConnection`。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] Canvas 工具条提供“添加文本”和“添加图片”：`CanvasWorkspace` 已接入，浏览器 smoke 验证。
- [x] 文本节点可显示和编辑内容：`CanvasViewport.test.tsx` 和浏览器 smoke 验证。
- [x] 图片节点可显示上传图片：浏览器 smoke 使用本地 PNG 文件上传并恢复。
- [x] 节点可选中、拖动并持久化位置：浏览器 smoke 中 text position 保存为 `{ x: 186, y: 146 }`，刷新后仍为 2 个节点和 1 条连线。
- [x] 删除节点会删除相关连线：`canvas-store.test.ts` 覆盖，浏览器 smoke 删除连线后删除文本节点，最终状态为 1 个节点、0 条连线。
- [x] 节点之间可创建基础连线并刷新恢复：浏览器 smoke 验证 before/after reload 均为 1 条连线。

**明确不做逐项核对**

- [x] 不实现生成节点、批量节点、配置节点或 DAG 执行器。源码未新增 `generate` 节点 UI 或 Canvas 生成调用。
- [x] 不接图片生成、partial preview、history、gallery 或 reference 桥。源码 grep 未发现新增相关桥接入口。
- [x] 不把 Canvas 图片导入参考图系统。图片节点只由 file input 读取为 data URL 后传入 `addImageNode`。
- [x] 不支持多选、框选、复杂端口、曲线编辑、连接重排或自动布局。
- [x] 不改变经典工作台 `CanvasArea` 结果网格行为；现有 `CanvasArea.test.tsx` 继续通过。

**关键决策落地**

- [x] D1 Canvas node 类型放在 `src/shared/types.ts`，供 service/store/UI 共享。
- [x] D2 `schemaVersion` 仍为 1，旧空 project 无迁移即可恢复。
- [x] D3 图片节点通过本地 file input -> data URL -> project JSON，不进入 reference/history/gallery。
- [x] D4 连线 kind 根据源节点推断：text -> `prompt`，image -> `reference-image`。
- [x] D5 节点选择态是 UI 局部状态，不进入 store/project。

**流程级约束核对**

- [x] 无 active project 时添加按钮禁用；store action 没有 active project 会直接返回。
- [x] 节点坐标和尺寸由 service 规范化，避免 NaN 或极端值。
- [x] 图片节点只接受 `image/*` 且 data URL 以 `data:image/` 开头；非图片 payload 不写入。
- [x] 删除节点同步删除相关 connections。
- [x] 重复连线不重复写入，store 和 service 双层守护。
- [x] 持久化失败时 store 回滚旧 project 并显示错误；`canvas-store.test.ts` 覆盖 `disk full`。
- [x] 连续添加节点默认按列错开，避免新图片节点遮住文本节点操作区；选中节点 z-index 提升，避免重叠时操作按钮被后创建节点盖住。

**挂载点反向核对**

- [x] `src/shared/types.ts`：Canvas node/connection 共享类型和 project 契约。
- [x] `src/services/canvas-projects.ts`：nodes/connections 规范化和持久化。
- [x] `src/store/canvas-store.ts`：节点/连线 actions 和统一 optimistic persist/rollback helper。
- [x] `src/components/canvas/CanvasWorkspace.tsx`：添加文本/图片入口和文件读取。
- [x] `src/components/canvas/CanvasViewport.tsx` + `CanvasNodeLayer.tsx`：节点、连线、选择、拖动、删除 UI。
- [x] 反向 grep：新 Canvas basic nodes 代码集中在上述 Canvas 边界内，未发现清单外业务挂载点。
- [x] 拔除沙盘推演：移除共享类型扩展、service/store nodes actions、CanvasWorkspace 工具条和 CanvasNodeLayer 后，本 feature 能力消失；canvas-project-shell 的模式入口和基础 viewport 可独立保留。

## 3. 验收场景核对

- [x] **S1**：进入已有 Canvas project 后点击“添加文本” -> 画布出现文本节点，刷新后仍存在。
  - 证据来源：浏览器 smoke + `canvas-store.test.ts`。
  - 结果：通过。
- [x] **S2**：编辑文本节点内容 -> 内容保存到 `metadata.content`，刷新后恢复。
  - 证据来源：浏览器 smoke，文本为“节点 A：用于连接和持久化”。
  - 结果：通过。
- [x] **S3**：通过“添加图片”选择本地图片 -> 画布出现图片节点，图片预览可见，刷新后恢复。
  - 证据来源：浏览器 smoke + 截图 `canvas-basic-nodes-smoke.png`。
  - 结果：通过。
- [x] **S4**：拖动节点 -> 节点位置变化，释放后持久化，刷新后位置一致。
  - 证据来源：浏览器 smoke，text position 为 `{ x: 186, y: 146 }`。
  - 结果：通过。
- [x] **S5**：删除选中节点 -> 节点从画布消失，与它相关的连线也消失。
  - 证据来源：`canvas-store.test.ts` + 浏览器 smoke after_delete 为 1 个节点、0 条连线。
  - 结果：通过。
- [x] **S6**：从一个节点发起连接并连接到另一个节点 -> 出现连线，刷新后恢复。
  - 证据来源：浏览器 smoke before_reload / after_reload 均为 2 个节点、1 条连线。
  - 结果：通过。
- [x] **S7**：删除选中连线 -> 连线消失，不影响两端节点。
  - 证据来源：`CanvasViewport.test.tsx` + 浏览器 smoke。
  - 结果：通过。
- [x] **S8**：非图片文件或无 active project 时 -> 不写入 nodes，UI 不白屏。
  - 证据来源：`canvas-store.test.ts` 覆盖 invalid image payload；`CanvasWorkspace.test.tsx` 覆盖无 active conversation 空状态。
  - 结果：通过。

**前端浏览器验证**

- [x] `pnpm check`：TypeScript + 全量 Vitest 通过，30 个测试文件、136 个用例通过。
- [x] `pnpm build`：生产构建通过；Vite 仍提示单 chunk 超过 500 kB，这是既有构建体积提示。
- [x] Playwright smoke：打开 `http://localhost:1420/`，完成添加文本、编辑文本、上传图片、拖动、连接、刷新恢复、删除连线、删除节点。
- [x] 截图证据：`.codestable/features/2026-06-05-canvas-basic-nodes/canvas-basic-nodes-smoke.png`。

## 4. 术语一致性

- Canvas node：源码使用 `CanvasNodeData`、`CanvasNodeMetadata`、`CanvasNodeLayer`，与 design 一致。
- Text node / Image node：源码类型为 `text` / `image`，没有提前引入 `generate` 类型。
- Canvas connection：源码使用 `CanvasConnection` 和 `CanvasConnectionKind`，当前只实现 `prompt` / `reference-image`。
- Selected canvas item：只在 `CanvasNodeLayer` 局部使用 `SelectedCanvasItem`，没有持久化。
- 防冲突：`CanvasArea` 仍只属于经典工作台结果网格；新增节点渲染在 `components/canvas` 下。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已补充 Canvas text/image node、Canvas connection、CanvasNodeLayer、Canvas store node actions、service normalization 和图片节点 data URL 约束。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已把 Canvas project shell 扩展为 basic nodes，并更新硬边界为“文本/图片节点和轻量连线，不接生成/图库/历史/参考图互通”。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement` 为空。
- [x] 本 feature 是 `workspace-canvas-mode` roadmap 下的实现单元，不新增独立用户愿景文档；也未改变 `reference-image-input` 的用户故事或边界。
- [x] 结论：无 requirement 回写。

## 7. roadmap 回写

- [x] 方案 frontmatter 指向 `roadmap: workspace-canvas-mode` / `roadmap_item: canvas-basic-nodes`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-items.yaml`：`canvas-basic-nodes` 已由 `in-progress` 改为 `done`，保留 `feature: 2026-06-05-canvas-basic-nodes`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-roadmap.md`：第 5 节子 feature 清单已同步为 `状态：done` / `对应 feature：2026-06-05-canvas-basic-nodes`。
- [x] YAML 校验：`workspace-canvas-mode-items.yaml` 和 `canvas-basic-nodes-checklist.yaml` 均通过 `validate-yaml.py --yaml-only`。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露新的项目常驻事项。`localhost:1420` 的 web smoke 候选已在 `canvas-project-shell` 验收报告中登记，本次不重复新增。

## 9. 遗留

- 后续优化点：节点重叠时当前只用 selected z-index 提升解决；后续可以增加自动避让、对齐线或层级调整，但不属于基础节点 MVP。
- 已知限制：不支持生成节点、多选/框选、复杂端口、曲线编辑、连接重排、自动布局、reference/history/gallery 互通、项目包导入导出或图片文件清理。
- 实现阶段顺手发现：连线中点落在节点上时 SVG 内按钮会被遮挡，已改为 HTML overlay；连续创建节点遮挡操作区，已改为默认网格错位。
