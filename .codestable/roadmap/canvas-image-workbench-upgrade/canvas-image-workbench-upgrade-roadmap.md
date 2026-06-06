---
doc_type: roadmap
slug: canvas-image-workbench-upgrade
status: completed
created: 2026-06-06
last_reviewed: 2026-06-06
tags: [canvas, image-generation, workbench, ux]
related_requirements: [reference-image-input]
related_architecture: [ui-shadcn-workbench]
---

# Canvas 生图工作台升级

## 1. 背景

PixAI 当前 Canvas 已有项目、视口、文本 / 图片 / 生成 / 配置 / 批量 / 结果节点、基础连线和顺序 workflow run，但体验仍像能力堆叠后的技术 demo：工具栏占据顶部页面区域、节点操作分散、连接后要手动补节点、生成上下文不够可见，用户很难像在专业无限画布里连续迭代图片。

本 roadmap 参照本地 `E:\MyWork\infinite-canvas` 和本地部署页面 `http://localhost:3000/canvas/LG8NIA6-8we2_wA7WtOWr` 的画布体验，升级 PixAI Canvas 的生图相关能力。参考项目里的视频、音频、账号、后台和 Ant Design 体系不迁入；只吸收无限画布交互、生图节点、资源上下文、结果组织和操作反馈这些适合 PixAI 的设计。

用户已授权本轮由 AI 自主决策、实现、测试、review 和验收，不再等待逐步人工拍板。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- Canvas 主界面改为真正的画布优先体验：全屏画布、浮动 dock、轻量项目命令区和更清晰的空状态。
- 生图相关节点交互升级：节点选择、hover 操作、文本节点一键生成、图片/结果节点快速编辑入口、生成节点状态反馈。
- 连接创建体验升级：从文本 / 图片 / 结果 / 配置 / 批量 / 生成节点出发，能更自然地连接或创建下游生图节点。
- 生成上下文升级：按连接关系解析上游文本、图片、配置、批量变体，并在 UI 中可见化本次输入摘要。
- 批量和多图结果升级：多张结果在 Canvas 中有清晰组织，不再只是松散生成多个孤立节点。
- 图库 / 历史 / 参考图继续复用 PixAI 既有 `ImageService`、history、reference 和 Provider 设置，不新增平行生成服务。
- 每个子 feature 完成时都要跑类型检查、定向测试、浏览器 smoke 和代码 review。

### 明确不做

- 不迁入参考项目的视频节点、音频节点、视频/音频生成、Seedance、音频设置或相关媒体文件存储。
- 不迁入参考项目的账号体系、Go 后端、Ant Design 组件体系、Next.js App Router 或本地 localforage store。
- 不复制 AGPL 项目的实现代码；只参考交互和结构，用 PixAI 现有 React/Tauri/shadcn/Zustand 架构重写。
- 不改变 PixAI Provider、Tauri API、本地数据库和 `ImageService` 的事实源职责；Canvas 仍复用现有生成链路。
- 不在第一轮做云同步、多人协作、复杂 DAG 调度、后台队列、并发执行、workflow agent 或视频/音频资产包。
- 不把现有经典工作台重写为 Canvas；Workspace 和 Canvas 继续是两套主界面 Shell。

## 3. 模块拆分（概设）

```text
canvas-image-workbench-upgrade
├── canvas-experience-shell：画布优先的主界面、dock、项目命令和空状态
├── node-action-model：节点选择、hover 工具、快捷操作和上下文菜单
├── connection-authoring：连线、连接目标识别、从连接创建下游节点
├── generation-context：连接关系到生图输入的解析与可视化摘要
├── result-composition：单次 / 批量 / 多图结果在 Canvas 中的组织方式
├── asset-bridge：历史、图库、参考图和本地图片加入 Canvas 的生图素材桥
└── verification-harness：组件测试、store 测试、浏览器 smoke 和 review 清单
```

### canvas-experience-shell · 画布主体验

- **职责**：把 `CanvasWorkspace` 从页面式 header + content 改为画布优先界面；新增浮动 dock、轻量项目状态、导入导出/运行/重置等命令入口；保留 CanvasShell 的项目侧栏。
- **承载的子 feature**：canvas-workbench-dock-shell。
- **触碰的现有代码 / 模块**：`src/components/canvas/CanvasWorkspace.tsx`、`CanvasViewport.tsx`、`CanvasWorkspace.test.tsx`、layout 相关测试。

### node-action-model · 节点操作模型

- **职责**：统一节点选中态、hover 工具、删除、预览、mask 编辑、文本一键生成、生成节点重试和节点标题/状态表达；不改变生成服务。
- **承载的子 feature**：canvas-node-action-toolbar。
- **触碰的现有代码 / 模块**：`CanvasNodeLayer.tsx`、`CanvasGenerateNodeBody.tsx`、`CanvasImageNodeBody.tsx`、`CanvasResultNodeBody.tsx`。

### connection-authoring · 连线与创建

- **职责**：让用户从一个节点出发连接到已有节点，或在空白处直接创建一个语义正确的下游节点；连接类型继续由 `canvasConnectionKindForNodes()` 决定。
- **承载的子 feature**：canvas-connection-create-menu。
- **触碰的现有代码 / 模块**：`CanvasNodeLayer.tsx`、`canvas-store.ts`、`canvas-projects.ts`。

### generation-context · 生图上下文

- **职责**：把上游文本、图片/结果、配置、批量变体解析为 PixAI `GenerateImageInput` 所需的 prompt、referenceImageIds 和配置 patch；在生成节点 UI 显示输入摘要。
- **承载的子 feature**：canvas-generation-context-panel。
- **触碰的现有代码 / 模块**：`src/services/canvas-workflow.ts`、`src/store/app-store.ts`、`CanvasGenerateNodeBody.tsx`、新增 context helper。

### result-composition · 结果组织

- **职责**：对单次 `n > 1`、批量变体和 workflow 结果进行清晰的 Canvas 布局和状态表达；优先复用可写 `result` 节点，不可复用时追加新的 result node。
- **承载的子 feature**：canvas-result-composition。
- **触碰的现有代码 / 模块**：`canvas-store.ts`、`CanvasNodeLayer.tsx`、`CanvasResultNodeBody.tsx`、`app-store.ts`。

### asset-bridge · 生图素材桥

- **职责**：让用户更容易把历史图、图库图、本地图片和当前参考图加入 Canvas，并在 Canvas 内作为参考图继续生图；不新增另一套资产库事实源。
- **承载的子 feature**：canvas-asset-bridge-polish。
- **触碰的现有代码 / 模块**：`CanvasWorkspace.tsx`、`ImageTile.tsx`、`GalleryPage.tsx`、reference actions。

### verification-harness · 验证与 review

- **职责**：为每个子 feature 补充可重复验证证据，包含组件测试、store / service 测试、浏览器 smoke 和代码 review 发现清单。
- **承载的子 feature**：所有子 feature。
- **触碰的现有代码 / 模块**：测试文件、CodeStable feature acceptance。

## 4. 模块间接口契约 / 共享协议（架构层详设）

### 4.1 Canvas dock 命令协议

**方向**：CanvasWorkspace → Canvas store / app store
**形式**：React props + Zustand action

**契约**：

```ts
type CanvasDockCommand =
  | 'add-text'
  | 'add-image'
  | 'add-generate'
  | 'add-config'
  | 'add-batch'
  | 'add-result'
  | 'run-workflow'
  | 'reset-viewport'
  | 'import-project'
  | 'export-project'
  | 'open-guide'

type CanvasWorkspaceCommandHandlers = {
  onAddText(): void | Promise<void>
  onAddImage(): void
  onAddGenerate(): void | Promise<void>
  onAddConfig(): void | Promise<void>
  onAddBatch(): void | Promise<void>
  onAddResult(): void | Promise<void>
  onRunWorkflow(): void | Promise<void>
  onResetViewport(): void | Promise<void>
  onImportProject(file: File): void | Promise<void>
  onExportProject(): void | Promise<void>
}
```

**约束**：

- Dock 只触发命令，不持有 Canvas project 数据。
- Dock 不渲染视频/音频按钮。
- `run-workflow` 仍调用 `useAppStore.runCanvasWorkflow()`，不得绕开 `ImageService`。

### 4.2 节点操作协议

**方向**：CanvasNodeLayer → Canvas node body / store action
**形式**：组件 callback

**契约**：

```ts
type CanvasNodeAction =
  | { type: 'select'; nodeId: string }
  | { type: 'delete'; nodeId: string }
  | { type: 'connect'; nodeId: string }
  | { type: 'generate-from-text'; nodeId: string }
  | { type: 'run-generate'; nodeId: string }
  | { type: 'preview-image'; nodeId: string }
  | { type: 'mask-edit'; nodeId: string }

type CanvasNodeActionHandlers = {
  onNodeDelete(nodeId: string): void | Promise<void>
  onConnectionAdd(fromNodeId: string, toNodeId: string): void | Promise<void>
  onTextNodeGenerate?(nodeId: string): void | Promise<void>
  onGenerateNodeRun(nodeId: string): void | Promise<void>
}
```

**约束**：

- 文本节点一键生成可以自动创建 generate/result 节点并连线，但最终生成仍调用现有 `generateCanvasNode()`。
- 图片 / 结果节点只作为生图参考图输入，不引入视频/音频资源。
- 删除节点必须同步删除相关 connections。

### 4.3 连接创建协议

**方向**：CanvasNodeLayer → Canvas store
**形式**：函数调用

**契约**：

```ts
type CanvasConnectedNodeInput = {
  sourceNodeId: string
  type: Extract<CanvasNodeType, 'text' | 'image' | 'generate' | 'config' | 'batch' | 'result'>
  position: CanvasPoint
}

type CanvasStoreState = {
  addConnectedNode(input: CanvasConnectedNodeInput): Promise<CanvasNodeData | null>
}
```

**约束**：

- `addConnectedNode()` 必须先创建目标节点，再用 `canvasConnectionKindForNodes(source, target)` 判定能否连接。
- 不能创建 `video` 或 `audio` 节点类型。
- 目标节点创建失败或连接类型非法时不改变项目。
- 新节点位置使用世界坐标，受当前 viewport 缩放影响。

### 4.4 生图上下文摘要协议

**方向**：canvas-workflow service → CanvasGenerateNodeBody
**形式**：纯函数 + props

**契约**：

```ts
type CanvasGenerationInputSummary = {
  promptTextCount: number
  referenceImageCount: number
  configCount: number
  batchVariantCount: number
  requestCount: number
  missingPrompt: boolean
}

function summarizeCanvasGenerationInput(project: CanvasProject, nodeId: string): CanvasGenerationInputSummary
```

**约束**：

- summary 只做展示，不触发生成，不写 store。
- `missingPrompt` 规则必须和 `buildCanvasGenerationPlanForNode()` 一致。
- summary 不读取 Provider、history 或 reference 文件内容。

### 4.5 结果组织协议

**方向**：app-store generation bridge → canvas-store
**形式**：store action

**契约**：

```ts
type CanvasImageNodeInput = {
  name: string
  dataUrl: string
  mimeType: string
  fileSizeBytes: number
  naturalWidth?: number
  naturalHeight?: number
  referenceImageId?: string
  historyItemId?: string
  storagePath?: string | null
  requestIndex?: number
  batchRootId?: string
  batchIndex?: number
  promptVariant?: string
}

type CanvasStoreState = {
  recordGeneratedResult(sourceNodeId: string, input: CanvasImageNodeInput): Promise<void>
}
```

**约束**：

- `historyItemId` 仍是最终结果事实源。
- 有显式 result node 连接时，空 result node 或同一 `historyItemId` 的 result node 可复用；已承载不同结果的 result node 不覆盖。
- 没有可写 result node 时自动在 generate node 右侧创建追加 result 节点，并连 `result` connection。
- 多结果布局和 batch metadata 只能增强 Canvas 展示，不改变 history 数据结构。

## 5. 子 feature 清单

1. **canvas-workbench-dock-shell** — 把 CanvasWorkspace 改成画布优先界面，新增浮动 dock、轻量项目命令区和更好的空状态。
   - 所属模块：canvas-experience-shell
   - 依赖：无
   - 状态：done
   - 对应 feature：2026-06-06-canvas-workbench-dock-shell
   - 备注：最小闭环，做完后 Canvas 像一个独立无限画布，而不是带顶部表单条的页面。

2. **canvas-node-action-toolbar** — 升级节点选中 / hover 操作，提供文本一键生成、图片预览 / mask、生成重试和统一删除入口。
   - 所属模块：node-action-model
   - 依赖：canvas-workbench-dock-shell
   - 状态：done
   - 对应 feature：2026-06-06-canvas-node-action-toolbar

3. **canvas-connection-create-menu** — 支持从节点连接到空白位置时直接创建合法下游节点并自动连线；text/image/result/config/batch 创建 generate，generate 创建 result。
   - 所属模块：connection-authoring
   - 依赖：canvas-node-action-toolbar
   - 状态：done
   - 对应 feature：2026-06-06-canvas-connection-create-menu

4. **canvas-generation-context-panel** — 为生成节点补输入摘要和上下文解析 polish，让上游文本、图片、配置、批量变体在生成前可见。
   - 所属模块：generation-context
   - 依赖：canvas-connection-create-menu
   - 状态：done
   - 对应 feature：2026-06-06-canvas-generation-context-panel

5. **canvas-result-composition** — 优化单次多图、批量和 workflow 结果在 Canvas 中的布局、标题、状态和可继续引用能力。
   - 所属模块：result-composition
   - 依赖：canvas-generation-context-panel
   - 状态：done
   - 对应 feature：2026-06-06-canvas-result-composition

6. **canvas-asset-bridge-polish** — polish 本地图片、历史图、图库图和当前参考图加入 Canvas 的入口与反馈。
   - 所属模块：asset-bridge
   - 依赖：canvas-workbench-dock-shell
   - 状态：done
   - 对应 feature：2026-06-06-canvas-asset-bridge-polish

**最小闭环**：第 1 条 `canvas-workbench-dock-shell` 做完后，用户能进入 PixAI Canvas，在一个画布优先界面里通过浮动 dock 添加文本 / 图片 / 生成 / 配置 / 批量 / 结果节点，运行 workflow、导入导出、重置视图，并且不出现视频/音频入口。

## 6. 排期思路

先做 `canvas-workbench-dock-shell`，因为它能立刻改变“Canvas 太烂”的第一感知，并且不触碰生成服务风险。随后做节点操作和连接创建，把参考项目里最核心的“节点上直接继续创作”的体验补上。生成上下文和结果组织排在后面，因为它们涉及 workflow 解析、结果回写和 history 绑定，需要在交互骨架稳定后再做。资产桥 polish 可以在第一条之后并行推进，但不阻塞生成主链路。

## 7. 观察项

- 参考项目源码包含 AGPL 协议，本 roadmap 只参考交互和结构，不复制实现代码。
- Headless Playwright 访问本地参考 URL 时因缺少登录 / 本地状态被重定向到 `/canvas`，实际参考以源码为主。
- PixAI 当前 `src/store/app-store.ts` 偏胖，Canvas 生成桥继续加逻辑会增加维护压力；如果后续改动过重，建议另起 refactor 拆分 Canvas action。
- 现有 `WorkspaceConfigPanel / SettingsToggleRow` 嵌套 button warning 仍是遗留问题，本 roadmap 不处理。
