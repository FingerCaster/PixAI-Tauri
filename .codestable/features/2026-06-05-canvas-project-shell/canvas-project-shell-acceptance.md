# Canvas Project Shell 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-canvas-project-shell/canvas-project-shell-design.md`
> 用户终审：待用户确认；本报告已完成自动化测试、构建和浏览器 smoke 验证

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `View` 包含 `canvas`，并导出 `isWorkbenchView(view)`：实现位于 `src/store/app-store.ts`，Canvas 与 classic workspace 同属工作台类 view。
- [x] `CanvasViewport`、`CanvasProject`、`CanvasProjectSummary`、`CanvasProjectInput`：实现位于 `src/shared/types.ts`，第一版 `nodes` / `connections` 固定为空数组契约。
- [x] `CanvasProjectApi` 暴露 `list/get/create/update/delete`：实现位于 `src/services/app-api.ts`，并挂在 `pixaiApi.canvas`。
- [x] `CanvasStoreState` 和 `useCanvasStore`：实现位于 `src/store/canvas-store.ts`，包含项目摘要、当前项目、loading/error、默认项目、打开项目和视口更新动作。

**名词层“现状 -> 变化”逐项核对**

- [x] `view` 从 `workspace/gallery/prompts` 扩展为 `workspace/canvas/gallery/prompts`，没有引入第二套路由系统。
- [x] Canvas project 是独立本地实体，未写入 `AppDatabase` 的 conversations/runs/history。
- [x] 新 UI 放在 `src/components/canvas/`，没有把真正无限画布文件塞进已有 `src/components/workspace/CanvasArea.tsx`。
- [x] `CanvasProjectService` 使用 state key `pixai-canvas-projects`，与 `pixai-data` 分离。

**流程图核对**

- [x] “点击 Canvas -> setView('canvas') -> App 渲染 CanvasWorkspace -> ensureDefaultProject -> pixaiApi.canvas -> CanvasViewport -> updateViewport 持久化”均有代码落点。关键 grep：`setView('canvas')`、`view === 'canvas'`、`CanvasWorkspace`、`ensureDefaultProject`、`pixaiApi.canvas`、`updateViewport`。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 顶部导航出现 Canvas 入口，点击后 store view 变为 `canvas`：`src/components/layout/MainLayout.test.tsx` 覆盖。
- [x] 首次进入 Canvas 自动创建绑定当前 `activeConversationId` 的默认项目：`src/store/canvas-store.test.ts` 覆盖。
- [x] 默认项目创建具备 single-flight，React StrictMode / effect 重入不会重复创建：`deduplicates concurrent default project creation` 覆盖。
- [x] 空无限画布支持平移、缩放、重置和刷新恢复：浏览器 smoke 验证 viewport 从 `{ x: 0, y: 0, k: 1 }` 变为 `{ x: 96, y: 54, k: 1.08 }`，刷新后恢复一致。
- [x] 没有 `activeConversationId` 时显示可恢复空状态，不创建无绑定项目：`src/components/canvas/CanvasWorkspace.test.tsx` 覆盖。

**明确不做逐项核对**

- [x] 未新增图片生成、partial preview、历史、图库或参考图桥入口。源码 grep 未命中 `generateCanvasNode` / `onPartialImage` / Canvas 生成入口。
- [x] 未渲染文本节点、图片节点、生成节点或连线。源码中没有 `CanvasNode` / `CanvasConnection` 实体实现，roadmap/design 文档中的后续规划不算当前实现。
- [x] 未修改经典工作台结果网格行为。`CanvasArea` 仍只由 `Workspace` 引用，且 `CanvasArea.test.tsx` 继续通过。
- [x] 未新增云同步、项目包导入导出、S3/R2 或视频节点 API。
- [x] 未把 Canvas project actions 加入 `useAppStore` 主 action 列表；`app-store.ts` 只改 View 类型和 helper。

**关键决策落地**

- [x] D1 `canvas` 是 App view 同级分支：`src/App.tsx` 和 `MainLayout` 已接入。
- [x] D2 Canvas project 绑定进入 Canvas 时的当前会话：`CanvasWorkspace` 读取 `activeConversationId` 后调用 `ensureDefaultProject(activeConversationId)`。
- [x] D3 Canvas 状态放进独立 `useCanvasStore`：未扩大 `useAppStore` 职责。
- [x] D4 Canvas project 持久化放进独立 `CanvasProjectService` 和 `pixai-canvas-projects`。
- [x] D5 Canvas UI 放入 `src/components/canvas/`，避免与旧 `CanvasArea` 概念冲突。

**流程级约束核对**

- [x] 错误语义：Canvas store 捕获 service/API 异常，`CanvasWorkspace` 用 destructive badge 显示错误，不让画布白屏。
- [x] 幂等 / 并发：`defaultProjectRequest` 对同 conversation 的默认项目创建做 single-flight。
- [x] 缩放约束：`clampCanvasZoom()` 限制 `0.2 <= k <= 3`，service 测试覆盖 `k: 4 -> 3`。
- [x] 持久化失败回滚：`updateViewport()` 先 optimistic 更新，失败后恢复旧 project 并显示错误。
- [x] 无效 Canvas JSON：`CanvasProjectService.load()` 记录 `[PixAI Canvas] Invalid canvas project state; resetting.`，恢复为空项目列表，不影响 app database。

**挂载点反向核对**

- [x] `src/store/app-store.ts`：只新增 `canvas` view 和 `isWorkbenchView`。
- [x] `src/App.tsx`：只新增 `CanvasWorkspace` import 和 `view === 'canvas'` 渲染分支。
- [x] `src/components/layout/MainLayout.tsx`：顶部导航新增 Canvas 按钮和 lucide `Workflow` 图标。
- [x] `src/services/app-api.ts`：新增 `pixaiApi.canvas` 分区。
- [x] 本地 state key：`src/services/canvas-projects.ts` 中 `pixai-canvas-projects` 是 Canvas project 唯一持久化入口。
- [x] 反向 grep：Canvas shell 源码引用集中在 `src/components/canvas/`、`src/store/canvas-store.ts`、`src/services/canvas-projects.ts`、`src/shared/types.ts`、`src/App.tsx`、`src/components/layout/MainLayout.tsx` 和测试内，未发现清单外挂载点。
- [x] 拔除沙盘推演：删除 `src/components/canvas/`、`src/store/canvas-store.ts`、`src/services/canvas-projects.ts`，并逆向移除 App/MainLayout/app-api/shared types 挂载后，Canvas shell 能力会消失；经典 `Workspace` 和 `CanvasArea` 仍可独立保留。

## 3. 验收场景核对

- [x] **S1**：首次启动后点击顶部 Canvas -> 页面切到 Canvas 模式，自动创建默认 Canvas project，显示项目标题和空无限画布。
  - 证据来源：浏览器 smoke + `MainLayout.test.tsx` + `canvas-store.test.ts`。
  - 结果：通过。
- [x] **S2**：已有 Canvas project 后重新进入 Canvas -> 打开最近使用项目，项目标题和 viewport 与上次保存一致。
  - 证据来源：浏览器 smoke，刷新后 `restored` viewport 等于 `{ x: 96, y: 54, k: 1.08 }`。
  - 结果：通过。
- [x] **S3**：拖拽空白区域 -> 画布背景随鼠标平移，释放后持久化 `{ x, y, k }`。
  - 证据来源：浏览器 smoke，拖拽后 persisted viewport 为 `{ x: 96, y: 54, k: 1.08 }`。
  - 结果：通过。
- [x] **S4**：滚轮缩放 -> 缩放值变化且被约束，刷新后仍保留。
  - 证据来源：浏览器 smoke + `CanvasViewport.test.tsx` + `canvas-projects.test.ts`。
  - 结果：通过。
- [x] **S5**：点击重置视图 -> viewport 回到 `{ x: 0, y: 0, k: 1 }` 并持久化。
  - 证据来源：`CanvasViewport.test.tsx` 覆盖重置控件提交默认 viewport。
  - 结果：通过。
- [x] **S6**：本地 `pixai-canvas-projects` 数据损坏 -> Canvas service 不白屏，恢复为空项目列表，并可重新创建默认项目。
  - 证据来源：`canvas-projects.test.ts` 覆盖坏 JSON 恢复和重新创建。
  - 结果：通过。
- [x] **S7**：没有 `activeConversationId` 时进入 Canvas -> 显示可恢复空状态，不创建无绑定项目。
  - 证据来源：`CanvasWorkspace.test.tsx`。
  - 结果：通过。

**前端浏览器验证**

- [x] `pnpm check`：TypeScript + 全量 Vitest 通过，30 个测试文件、131 个用例通过。
- [x] `pnpm build`：生产构建通过；Vite 仍提示单 chunk 超过 500 kB，这是既有构建体积提示，不影响本 feature 验收。
- [x] Playwright smoke：打开 `http://localhost:1420/`，点击 Canvas，确认 project_count = 1，viewport box = `{ x: 276, y: 162, width: 1148, height: 722 }`，拖拽/缩放后 persisted/restored viewport 均为 `{ x: 96, y: 54, k: 1.08 }`。
- [x] 截图证据：`.codestable/features/2026-06-05-canvas-project-shell/canvas-project-shell-smoke.png`。

## 4. 术语一致性

- Canvas 模式：代码中以 `view === 'canvas'`、`CanvasWorkspace` 表达，与 design 一致。
- Canvas project：代码中以 `CanvasProject`、`CanvasProjectService`、`useCanvasStore` 表达，未混入 `Workspace` 或旧 `CanvasArea`。
- Canvas viewport：代码中以 `{ x, y, k }` 和 `CanvasViewport` 表达，和设计契约一致。
- 防冲突：`CanvasArea` 仍是经典工作台结果网格；真正无限画布组件命名为 `CanvasViewport`，避免复用旧名称。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已补充 `canvas` view、`CanvasWorkspace`、`CanvasViewport`、独立 `useCanvasStore`、`CanvasProjectService`、`pixai-canvas-projects` state key、viewport zoom 约束和坏 JSON 恢复语义。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已记录第一版 Canvas project 绑定创建时 `activeConversationId`，暂不接生成、partial preview、history/gallery/reference、导入导出或节点执行器。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已在总入口补充 Canvas 模式术语、Canvas project shell 模块索引和第一版硬边界。

## 6. requirement 回写

- [x] 方案 frontmatter 指向 `requirement: reference-image-input`。
- [x] 本 feature 没有改变参考图用户故事、pitch 或边界，只为后续 `canvas-reference-bridge` 提供承载面。
- [x] 结论：`reference-image-input` 当前为 current，不需要为本 feature 回写；未修改 `requirements/VISION.md`。

## 7. roadmap 回写

- [x] 方案 frontmatter 指向 `roadmap: workspace-canvas-mode` / `roadmap_item: canvas-project-shell`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-items.yaml`：`canvas-project-shell` 已由 `in-progress` 改为 `done`，保留 `feature: 2026-06-05-canvas-project-shell`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-roadmap.md`：第 5 节子 feature 清单已同步为 `状态：done` / `对应 feature：2026-06-05-canvas-project-shell`。
- [x] YAML 校验：`workspace-canvas-mode-items.yaml` 和 `canvas-project-shell-checklist.yaml` 均通过 `validate-yaml.py --yaml-only`。

## 8. attention.md 候选盘点

- [x] 候选：本地 Vite dev server 在当前配置下可能监听 `localhost` / IPv6，`http://127.0.0.1:1420/` 曾被拒绝但 `http://localhost:1420/` 正常返回 200。建议后续如频繁做浏览器 smoke，可用 `cs-note` 记录“Web smoke 默认访问 `http://localhost:1420/`”。
- [x] 本报告仅登记候选，未擅自修改 `.codestable/attention.md`。

## 9. 遗留

- 后续优化点：`src/store/app-store.ts` 仍偏胖；本 feature 只做 View 层最小改动，后续若继续扩状态可另起 `cs-refactor` 评估 store 拆分。
- 后续优化点：旧 `src/components/workspace/CanvasArea.tsx` 名称仍容易与真正 Canvas 模式混淆，建议后续与经典工作台结果区相关 feature 中再评估重命名。
- 已知限制：当前 Canvas 只提供项目 shell 和空 viewport，不支持节点、连线、生成、图库/历史/参考图互通或项目导入导出。
- 实现阶段顺手发现：React StrictMode / effect 重入会触发默认项目重复创建风险，已通过 `defaultProjectRequest` single-flight 修复并加回归测试。
