# Canvas Advanced Workflow Nodes 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-canvas-advanced-workflow-nodes/canvas-advanced-workflow-nodes-design.md`

## 1. 接口契约核对

- [x] `CanvasNodeType` 已扩展为 `text | image | generate | config | batch | result`，`CanvasConnectionKind` 已扩展为 `prompt | reference-image | result | config | batch`。
- [x] `CanvasNodeMetadata` 已支持 `ratio/quality/n`，并继续保留 status、run/history、reference 和图片展示字段。
- [x] `useCanvasStore` 已新增 `addConfigNode`、`addBatchNode`、`addResultNode`、`updateNodeMetadata`、`recordGeneratedResult`。
- [x] `useAppStore` 已新增 `runCanvasWorkflow()`；`generateCanvasNode()` 复用同一套 workflow 计划解析。
- [x] `src/services/canvas-workflow.ts` 已落地为纯计划解析层，负责 config 合并、batch 展开、prompt 组装和 8 次请求预算。

## 2. 行为与决策核对

- [x] Canvas toolbar 可以添加 config / batch / result 节点，并能触发“运行工作流”。
- [x] config node 只影响连到同一 generate node 的本次请求；测试覆盖 ratio、quality、n 覆盖。
- [x] batch node 在 workflow run 中按非空行顺序展开；单节点运行只使用第一条非空变体。
- [x] result node 连接 generate node 时接收成功结果；没有 result node 时保留自动创建 image result node 的旧行为。
- [x] result node 可作为下游 reference-image 输入；缺 reference binding 时仍走当前 conversation 的 `reference.importPayloads()`。
- [x] workflow run 超过 8 次请求时整体拒绝，不进入半执行。
- [x] 单个 workflow 请求失败会标记当前 generate node failed，并继续后续计划。
- [x] 明确不做项守住：没有端口 UI、端口坐标、复杂 DAG、并发队列、持久 workflow 队列、workflow agent、隐藏 conversation 或 Canvas 专用 Provider。

挂载点核对：

- [x] `src/shared/types.ts`：Canvas 类型扩展。
- [x] `src/services/canvas-projects.ts`：新节点和新连接 kind normalize，running generate/result 导入降级。
- [x] `src/services/canvas-workflow.ts`：纯计划层。
- [x] `src/store/canvas-store.ts`：高级节点 action、metadata 更新和 result 回写。
- [x] `src/store/app-store.ts`：单节点/工作流执行编排。
- [x] `src/components/canvas/*`：高级节点 UI、toolbar 入口和 workflow 按钮。

## 3. 验收场景核对

- [x] 添加 config、batch、result 节点并刷新/导入导出保留：`canvas-store.test.ts`、`canvas-projects.test.ts` 覆盖。
- [x] 编辑 config node 后请求参数被覆盖：`app-store.test.ts` 覆盖 ratio `16:9`、quality `high`、n `2`。
- [x] batch node workflow 展开与预算：`canvas-workflow.test.ts` 覆盖空行过滤、批量展开和超 8 拒绝。
- [x] generate -> result node 成功回写：`canvas-store.test.ts`、`app-store.test.ts` 覆盖。
- [x] result node 作为 reference 输入：`app-store.test.ts` 覆盖 result node 导入为 reference。
- [x] workflow 单请求失败继续：`app-store.test.ts` 覆盖 1 成功 / 1 失败。
- [x] 前端 smoke：`.codestable/features/2026-06-05-canvas-advanced-workflow-nodes/canvas-advanced-workflow-nodes-smoke.png`，可见 toolbar、高级节点、运行工作流入口和 config/batch/generate/result 节点。

验证命令：

- [x] `pnpm vitest run src/services/canvas-projects.test.ts src/services/canvas-workflow.test.ts src/store/canvas-store.test.ts src/store/app-store.test.ts src/components/canvas/CanvasViewport.test.tsx src/components/canvas/CanvasWorkspace.test.tsx`：6 files / 58 tests passed。
- [x] `pnpm check`：32 files / 182 tests passed。
- [x] `pnpm build`：通过；仅保留既有 Vite chunk size warning。

## 4. 术语一致性

- Canvas config node、Canvas batch node、Canvas result node、Bounded Canvas workflow run 已写入 design 和 architecture。
- 代码命名使用 `config`、`batch`、`result`、`CanvasWorkflowPlan`、`MAX_CANVAS_WORKFLOW_REQUESTS`，与方案术语一致。
- 防冲突：`CanvasArea` 仍是经典工作台结果网格；Canvas 模式继续使用 `components/canvas` 目录。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：Canvas 模式摘要、模块索引、关键决定和硬边界已更新。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：术语、Canvas 交互、数据状态、代码锚点和约束已更新。
- [x] 架构归并后只看 architecture 即可知道当前支持 config/batch/result 节点和 8 次请求以内的顺序 workflow run。

## 6. requirement 回写

- [x] 本 feature 是 `workspace-canvas-mode` roadmap 的最后一个实现单元，不新增独立 requirement。
- [x] `.codestable/requirements/reference-image-input.md` 不因本 feature 改变用户故事或边界。

## 7. roadmap 回写

- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-items.yaml`：`canvas-advanced-workflow-nodes` 已改为 `done`，feature 指向 `2026-06-05-canvas-advanced-workflow-nodes`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-roadmap.md`：frontmatter `status` 已改为 `completed`，第 5 节子 feature 清单第 8 项已同步为 done。
- [x] YAML 校验：roadmap items、feature checklist、feature design 均通过。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露新的项目常驻事项。真实 Tauri 客户端使用 `pnpm dev:client` 的事项已在 `.codestable/attention.md` 中存在，本次不重复新增。

## 9. 遗留

- 后续优化点：`app-store.ts` 仍承担 Canvas 生成执行状态、runs/history refresh 和通知编排；后续如果继续增加 workflow 能力，建议走 `cs-refactor` 拆 Canvas generation orchestration slice。
- 已知限制：不支持端口体系、复杂 DAG、并发队列、后台批量调度、暂停/恢复/取消 workflow、workflow agent、带图片资源包的项目包或云同步。
- 实现阶段顺手发现：无方案外修复。
