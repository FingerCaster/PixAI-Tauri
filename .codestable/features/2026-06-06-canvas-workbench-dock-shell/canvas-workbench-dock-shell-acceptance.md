# Canvas Workbench Dock Shell 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-06
> 关联方案 doc：`.codestable/features/2026-06-06-canvas-workbench-dock-shell/canvas-workbench-dock-shell-design.md`

## 1. 接口契约核对

对照方案第 2.1 节，实际实现一致：

- [x] `CanvasWorkbenchDock`：在 `src/components/canvas/CanvasWorkspace.tsx` 内作为私有组件落地，承载文本、图片、生成、配置、批量、结果、运行、重置、导入、导出和引导入口；每个入口只调用上层传入 handler。
- [x] `CanvasProjectCommandBar`：在 `CanvasWorkspace.tsx` 内作为左上浮层落地，显示项目标题、节点数、项目数、错误状态，并复用导入、导出、引导 handler。
- [x] `CanvasEmptyWorkbench`：在无 active project 时显示带网格背景的空状态，并保留“新建 Canvas 项目”入口。
- [x] `CanvasViewportProps.emptyTitle / emptyDescription`：已加入 `src/components/canvas/CanvasViewport.tsx`，默认标题仍是 `Canvas`，CanvasWorkspace 可覆盖为空节点生图引导文案。
- [x] 流程图核对：`CanvasWorkspace -> CanvasViewport -> CanvasProjectCommandBar / CanvasWorkbenchDock -> 既有 add/run/reset/import/export/guide` 均有代码落点。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Canvas 有全高画布区域：`CanvasWorkspace` active project 分支改为 `relative h-full min-h-0 overflow-hidden`，`CanvasViewport` 占满容器。
- [x] 项目信息和低频命令移到轻量浮层：`CanvasProjectCommandBar` 左上覆盖，不再使用整行 header。
- [x] dock 只出现生图相关命令：文本、图片、生成、配置、批量、结果、运行、重置、导入、导出、引导。
- [x] 空项目 / 空节点状态能引导生图链路：无 project 显示新建画布；空节点显示“从这里开始生图”。
- [x] 现有 store、生成 workflow、导入导出、引导弹窗和 CanvasShell 项目侧栏语义不变：handler 仍调用既有 action，不改 store/schema。

明确不做逐项核对：

- [x] 没有新增或迁入视频、音频按钮 / 节点 / 设置。实现代码 grep 未命中 `视频|音频|Video|Audio|Music`，测试中的“视频/音频”仅用于反向断言。
- [x] 未修改 `ImageService`、Provider、history、reference、Tauri API 或数据库结构；本 feature 只触碰 CanvasWorkspace / CanvasViewport / 测试与 CodeStable 文档。
- [x] 未新增 Canvas node type；dock 只调用已有 `addTextNode/addImageNode/addGenerateNode/addConfigNode/addBatchNode/addResultNode`。

关键决策落地：

- [x] 先改界面骨架，不碰生成计算：`runCanvasWorkflow()` / `generateCanvasNode()` 等既有路径不变。
- [x] dock 是 CanvasWorkspace 私有组件：没有新增全局 UI 组件。
- [x] 导入/导出保留双入口：command bar 和 dock 都调用同一导入/导出 handler。
- [x] 空状态内嵌在 CanvasViewport：只新增可选文案 props。

挂载点反向核对：

- [x] 挂载点清单覆盖本 feature 代码落点：`CanvasWorkspace.tsx`、`CanvasViewport.tsx`、`CanvasWorkspace.test.tsx`。
- [x] grep 反向核查：`CanvasWorkbenchDock|CanvasProjectCommandBar|CanvasEmptyWorkbench|emptyTitle|emptyDescription` 只落在上述清单内。
- [x] 拔除沙盘推演：移除 `CanvasWorkbenchDock`/`CanvasProjectCommandBar` 调用、还原 `CanvasViewport` 空状态 props、删除对应测试即可卸载本 feature；无 store/schema 残留。

## 3. 验收场景核对

- [x] **S1**：进入有 active project 的 Canvas，画布区域占满主界面，底部显示浮动 dock。证据：浏览器 smoke 通过。
- [x] **S2**：dock 中存在文本、图片、生成、配置、批量、结果、运行、重置、导入、导出、引导入口。证据：`CanvasWorkspace.test.tsx` 新增覆盖 + 浏览器 smoke。
- [x] **S3**：dock 中不出现视频或音频入口。证据：组件测试反向断言 + grep 反向核查。
- [x] **S4**：点击文本 / 生成 / 配置 / 批量 / 结果仍能新增对应节点。证据：组件测试与浏览器 smoke。
- [x] **S5**：点击图片仍触发 `image/*` file input。证据：原“adds a local image node”组件测试继续通过。
- [x] **S6**：点击运行仍调用现有 workflow run。证据：高级节点 workflow 测试改为 dock 入口并通过。
- [x] **S7**：导入 / 导出仍复用现有项目导入导出函数。证据：既有导入导出组件测试继续通过。
- [x] **S8**：无 active project 时仍能新建 Canvas 项目。证据：既有新建项目测试继续通过。
- [x] **S9**：active project 无节点时显示面向生图链路的空状态文案。证据：新增组件测试 + 浏览器 smoke。

前端浏览器验证：

- [x] 临时 Vite 端口 `127.0.0.1:5181` 打开 PixAI，进入 Canvas 后确认 dock 命令、无视频/音频、空节点文案，点击“文本”和“生成”可创建节点；结束后停止临时进程。

验证命令：

- [x] `pnpm exec tsc --noEmit`：通过。
- [x] `pnpm exec vitest run src/components/canvas/CanvasWorkspace.test.tsx src/components/canvas/CanvasViewport.test.tsx src/components/layout/ShellLayout.test.tsx`：3 个文件 / 25 个测试通过。

## 4. 术语一致性

- `CanvasWorkbenchDock`：代码命中在 `CanvasWorkspace.tsx`，文档命中在 design / roadmap / architecture，含义一致。
- `CanvasProjectCommandBar`：代码命中在 `CanvasWorkspace.tsx`，文档含义一致。
- `CanvasEmptyWorkbench`：代码命中在 `CanvasWorkspace.tsx`，文档含义一致。
- `emptyTitle / emptyDescription`：只作为 `CanvasViewport` 空状态文案 props 使用。
- 禁用词核对：实现代码中没有视频、音频、Video、Audio、Music 入口；测试命中仅为反向断言。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已把 Canvas 模式更新为画布优先界面，补充 Canvas workbench dock 术语、CanvasWorkspace 当前结构、代码锚点和“dock 不承载视频/音频”的约束。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已在术语、模块索引、关键架构决定和硬边界补充 CanvasWorkspace 生图 dock 的当前事实与视频/音频排除边界。

## 6. requirement 回写

- [x] `requirement: reference-image-input` 当前已经是 `status: current`。本 feature 没有改变参考图输入的用户故事、数量 / 格式 / 大小限制或导入边界，只把 Canvas 图片入口放入 dock；因此 requirement 不需要更新。

## 7. roadmap 回写

- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-items.yaml`：`canvas-workbench-dock-shell` 已从 `in-progress` 改为 `done`，feature 保持 `2026-06-06-canvas-workbench-dock-shell`。
- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-roadmap.md`：第 5 节对应子 feature 已同步为 `done` 并填写 feature 目录名。
- [x] YAML 校验：roadmap items 和 checklist 通过 `validate-yaml.py --yaml-only`。

## 8. attention.md 候选盘点

- [x] 无候选。本 feature 未暴露新的编译、运行、测试或路径陷阱；已有 `pnpm dev:client` 注意事项仍适用。

## 9. 遗留

- 后续优化点：进入 roadmap 下一项 `canvas-node-action-toolbar`，补节点 hover / 选中工具、文本一键生成、图片预览 / mask、生成重试和统一删除入口。
- 已知限制：本 feature 只重排 Canvas 主界面命令，不实现连接创建菜单、生成上下文摘要、结果编组或资产桥 polish。
- 实现阶段顺手发现：`CanvasWorkspace.tsx` 仍偏胖，图片文件读取和 natural size 解析后续可单独重构；`WorkspaceConfigPanel / SettingsToggleRow` 嵌套 button warning 是既有遗留，不属于本 feature。
