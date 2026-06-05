---
doc_type: roadmap
slug: workspace-canvas-mode
status: completed
created: 2026-06-05
last_reviewed: 2026-06-05
tags: [workspace, canvas, image-generation, streaming]
related_requirements: [reference-image-input]
related_architecture: [ui-shadcn-workbench]
---

# 工作台 Canvas 模式

## 1. 背景

PixAI 当前工作台是会话式生成流：`Workspace` 组合 `Composer` 和结果网格 `CanvasArea`，`CanvasArea` 实际承载生成历史分页，不是无限画布。新增 Canvas 模式的目标，是让用户能在工作台内摆放文本、图片和生成节点，把参考图、提示词、生成结果组织成可持续编辑的创作项目。

本 roadmap 参考三个方向：`E:\image-workbench\image-workbench` 的项目、节点、连线和文件引用模型；`HuFakai/infinite-canvas` 的轻量节点类型与画布交互边界；`CookSleep/gpt_image_playground` 的流式 partial preview 链路。AGPL 项目只借鉴结构，不复制实现代码。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- 新增 `canvas` 工作台模式入口，让用户能从现有 App shell 进入 Canvas。
- Canvas project 数据模型、默认项目、保存、恢复和项目摘要。
- 无限画布基础交互：平移、缩放、选择、拖动、节点摆放。
- 文本节点、图片节点、生成节点和基础连线。
- 经典工作台和 Canvas 生成节点共用 partial preview 状态链。
- Canvas 生成节点复用现有 `ImageService`、`pixaiApi.image.generate`、runs/history 和 reference 能力。
- 历史、图库、参考图与 Canvas 的最小互通。
- 后置项目导入导出和高级 workflow 节点规划。

### 明确不做

- 不做云同步、账号协作、S3/R2 或服务端 Canvas 存储。
- 不做视频节点。
- 不直接复制 AGPL 项目的实现代码。
- 第一版不做完整端口体系、复杂 DAG 执行器、后台批量调度、并发队列或 workflow agent。
- 不把 Canvas 图片长期以大体积 base64 写入项目 JSON；需要长期文件引用时另起后续 feature。
- roadmap 阶段不改 `requirements/` 或 `architecture/` 现状文档，落地验收后再由 acceptance 回写。

## 3. 模块拆分（概设）

```text
workspace-canvas-mode
├── mode-shell：App/MainLayout 新增 canvas 工作台模式入口
├── canvas-project-store：项目模型、保存/恢复、默认项目
├── canvas-renderer：无限画布视口、选择、拖动、缩放
├── canvas-node-model：文本/图片/生成/配置/批量/结果节点和连线模型
├── streaming-preview-pipeline：adapter/service/store/UI partial preview 事件链
├── canvas-generation-bridge：生成节点复用现有 ImageService
├── library-reference-integration：history/gallery/reference 与 canvas 互通
└── project-package：后置导入导出能力
```

### mode-shell · 工作台模式入口

- **职责**：在现有 `View` 和 shell 导航中加入 `canvas`，并让 Canvas 与经典工作台共享工作区语义、主题、Provider 摘要和全局设置入口。
- **承载的子 feature**：canvas-project-shell。
- **触碰的现有代码 / 模块**：`src/App.tsx`、`src/components/layout/MainLayout.tsx`、`src/store/app-store.ts`、设置面板挂载逻辑。

### canvas-project-store · Canvas 项目状态

- **职责**：定义 Canvas project、项目摘要、默认项目、保存/恢复、删除和更新时间；第一版使用本地前端/Tauri 现有持久化边界，不新增服务端。
- **承载的子 feature**：canvas-project-shell、canvas-project-import-export。
- **触碰的现有代码 / 模块**：`src/shared/types.ts`、`src/services/app-api.ts`、`src/services/app-database.ts` 或同层本地存储服务、`src/store/app-store.ts`。

### canvas-renderer · 无限画布交互

- **职责**：负责世界坐标、视口变换、平移、缩放、选择、节点拖动和画布空状态；不负责图片生成业务。
- **承载的子 feature**：canvas-project-shell、canvas-basic-nodes。
- **触碰的现有代码 / 模块**：新增 `src/components/canvas/*` 或 `src/components/workspace/canvas/*`。

### canvas-node-model · 节点与连线模型

- **职责**：定义文本节点、图片节点、生成节点、配置节点、批量节点、结果节点和基础连线；第一版使用轻量连接类型，不引入完整多端口执行器。
- **承载的子 feature**：canvas-basic-nodes、canvas-reference-bridge、canvas-generate-node、canvas-advanced-workflow-nodes。
- **触碰的现有代码 / 模块**：`src/shared/types.ts`、Canvas 组件、Canvas store actions。

### streaming-preview-pipeline · 流式预览链路

- **职责**：把 Provider adapter 识别到的 partial image 事件传给 `ImageService` / store / UI；经典工作台和 Canvas 生成节点共用同一套 preview 状态。
- **承载的子 feature**：streaming-partial-preview-core、canvas-generate-node。
- **触碰的现有代码 / 模块**：`src/adapters/types.ts`、`src/adapters/openai-compatible.ts`、`src/services/image-service.ts`、`src/store/app-store.ts`、`GeneratingTile` / Canvas 节点展示。

### canvas-generation-bridge · Canvas 生成桥

- **职责**：把生成节点的 prompt、连接的文本 / 图片 / 结果 / 配置 / 批量节点转换成现有 `GenerateImageInput`，复用 `pixaiApi.image.generate`，并把最终 history item 绑定回 Canvas 节点。
- **承载的子 feature**：canvas-generate-node、canvas-advanced-workflow-nodes。
- **触碰的现有代码 / 模块**：`src/services/image-service.ts`、`src/services/app-api.ts`、`src/services/canvas-workflow.ts`、`src/store/app-store.ts`、Canvas 生成组件。

### library-reference-integration · 图库 / 历史 / 参考图互通

- **职责**：支持从历史图或参考图创建 Canvas 图片节点，Canvas 图片节点作为参考图参与生成，Canvas 生成结果可继续在图库中复用。
- **承载的子 feature**：canvas-reference-bridge、canvas-history-gallery-integration。
- **触碰的现有代码 / 模块**：`src/components/gallery/*`、`src/components/workspace/ImageTile.tsx`、reference import actions、history list。

### project-package · 项目导入导出

- **职责**：后置支持 Canvas project JSON 导入导出，未来再扩展为带图片文件的项目包。
- **承载的子 feature**：canvas-project-import-export。
- **触碰的现有代码 / 模块**：Canvas project store、文件读取/保存辅助、可能的 Tauri shell 能力。

## 4. 模块间接口契约 / 共享协议（架构层详设）

### 4.1 工作台 view 协议

**方向**：App shell → 页面模块

**形式**：Zustand view 状态 + React 条件渲染

**契约**：

```ts
export type View = 'workspace' | 'canvas' | 'gallery' | 'prompts'

export function isWorkspaceView(view: View): view is 'workspace' | 'canvas'
```

**约束**：

- `canvas` 是工作台模式，不是图库或提示词库；Provider 摘要、主题和全局设置入口继续复用现有 shell。
- 右侧工作区参数栏是否在 Canvas 中显示由具体 feature-design 决定，但 App 层必须避免只用 `view === 'workspace'` 作为所有工作台能力判断。
- 系统通知激活仍默认回到经典 `workspace`，不要自动切到 Canvas。

### 4.2 Canvas project 持久化协议

**方向**：Canvas UI / store → 本地持久化服务

**形式**：函数调用

**契约**：

```ts
export type CanvasProjectSummary = {
  id: string
  title: string
  updatedAt: string
  nodeCount: number
}

export type CanvasProject = {
  id: string
  title: string
  conversationId: string
  schemaVersion: 1
  nodes: CanvasNodeData[]
  connections: CanvasConnection[]
  viewport: { x: number; y: number; k: number }
  createdAt: string
  updatedAt: string
}

export type CanvasProjectInput = Partial<
  Pick<CanvasProject, 'title' | 'nodes' | 'connections' | 'viewport'>
>

export type CanvasProjectApi = {
  list(): Promise<CanvasProjectSummary[]>
  get(id: string): Promise<CanvasProject | null>
  create(input?: CanvasProjectInput): Promise<CanvasProject>
  update(id: string, input: CanvasProjectInput): Promise<CanvasProject>
  exportProject(id: string): Promise<CanvasProject>
  importProject(input: unknown, conversationId: string): Promise<CanvasProject>
  delete(id: string): Promise<void>
}
```

**约束**：

- 每个 Canvas project 必须绑定一个 `conversationId`，供现有生成、history 和 reference 能力复用。
- `schemaVersion` 第一版固定为 `1`，后续结构迁移不能静默破坏旧项目。
- 第一版 project JSON 可以保存 data URL 级图片引用，但大图长期文件引用和清理策略不在本 roadmap 的 MVP 中完成。
- 导入 project JSON 时永远克隆为新 project，刷新 project id，并绑定当前 active conversation；第一版不做 zip 资源包、云同步或批量导入导出。

### 4.3 Canvas 节点和连线协议

**方向**：Canvas renderer / node model / generation bridge 共享

**形式**：共享 TypeScript 类型

**契约**：

```ts
export type CanvasNodeType = 'text' | 'image' | 'generate' | 'config' | 'batch' | 'result'
export type CanvasNodeStatus = 'idle' | 'running' | 'succeeded' | 'failed'

export type CanvasNodeData = {
  id: string
  type: CanvasNodeType
  title: string
  position: { x: number; y: number }
  width: number
  height: number
  metadata: CanvasNodeMetadata
}

export type CanvasNodeMetadata = {
  content?: string
  prompt?: string
  status?: CanvasNodeStatus
  ratio?: ImageRatio
  quality?: ImageQuality
  n?: number
  historyItemId?: string
  runId?: string
  requestIndex?: number
  errorMessage?: string
  naturalWidth?: number
  naturalHeight?: number
  mimeType?: string
  fileSizeBytes?: number
}

export type CanvasConnectionKind = 'prompt' | 'reference-image' | 'result' | 'config' | 'batch'

export type CanvasConnection = {
  id: string
  fromNodeId: string
  toNodeId: string
  kind: CanvasConnectionKind
}
```

**约束**：

- `text` 节点的 `metadata.content` 可作为生成 prompt 片段。
- `image` 节点的 `metadata.content` 是展示图，`historyItemId` 存在时优先从 history 追溯最终图。
- `generate` 节点的 `metadata.prompt` 是本节点自带 prompt；连接的 `prompt` 文本节点按 feature-design 定义的顺序拼接。
- `config` 节点通过 `config` connection 覆盖目标 generate node 本次请求的 ratio、quality 和 n。
- `batch` 节点通过 `batch` connection 为 bounded workflow run 提供多行 prompt 变体。
- `result` 节点通过 `result` connection 接收 generate node 最近成功的 history item，并可作为后续 `reference-image` 输入。
- 第一版连线只表达语义，不保存端口坐标。

### 4.4 流式 partial preview 协议

**方向**：Provider adapter → ImageService → app store → UI

**形式**：回调 + store action

**契约**：

```ts
export type PartialImagePreview = {
  runId: string
  requestIndex: number
  partialImageIndex?: number
  dataUrl: string
  receivedAt: string
}

export type ImageGenerationProgressEvent =
  | { type: 'partial-image'; preview: PartialImagePreview }
  | { type: 'completed'; runId: string }
  | { type: 'failed'; runId: string; errorMessage: string }

export type ImageGenerationRequest = ExistingImageGenerationRequest & {
  onPartialImage?: (partial: {
    image: string
    requestIndex?: number
    partialImageIndex?: number
  }) => void
}

export type GenerationPreviewState = Record<string, Record<number, PartialImagePreview>>
```

**约束**：

- Adapter 负责识别 `image_generation.partial_image`、`image_edit.partial_image` 和 `response.image_generation_call.partial_image`。
- `ImageService` 负责补齐 `runId`、`requestIndex` 和时间，不让 UI 解析上游 SSE payload。
- partial preview 是临时 UI 状态，不写入 history；run 完成或失败后清理对应 preview。
- 服务商不返回 partial image 时，UI 保持现有生成中占位，不显示错误。

### 4.5 生成来源协议

**方向**：Canvas generation bridge → ImageService / history / gallery

**形式**：可选来源字段

**契约**：

```ts
export type GenerationOrigin =
  | { kind: 'workspace' }
  | { kind: 'canvas'; canvasProjectId: string; canvasNodeId: string }

export type GenerateImageInput = ExistingGenerateImageInput & {
  origin?: GenerationOrigin
}

export type CanvasGenerationBinding = {
  projectId: string
  nodeId: string
  runId: string
  requestIndex: number
  historyItemId?: string
}
```

**约束**：

- `origin` 缺省时按经典工作台处理。
- Canvas 生成仍必须传入 `conversationId`，不得绕过现有 run/history 事实源。
- Canvas 节点只保存和 history/run 的绑定，不自行复制完整生成结果记录。
- Gallery 展示 Canvas 来源时，优先读取 history item 的可选来源字段；Canvas binding 反查和跳回节点留给后续独立 feature。

### 4.6 Canvas 生成输入解析协议

**方向**：Canvas generation bridge → reference / image service

**形式**：函数调用

**契约**：

```ts
export type CanvasGenerateNodeInput = {
  projectId: string
  nodeId: string
}

export type ResolvedCanvasGenerationInput = {
  conversationId: string
  prompt: string
  referenceImageIds: string[]
  config?: {
    ratio?: ImageRatio
    quality?: ImageQuality
    n?: number
  }
  origin: { kind: 'canvas'; canvasProjectId: string; canvasNodeId: string }
}

export function resolveCanvasGenerationInput(
  project: CanvasProject,
  nodeId: string
): Promise<ResolvedCanvasGenerationInput>
```

**约束**：

- 缺项目报 `canvas_project_not_found`。
- 缺节点报 `canvas_node_not_found`。
- 缺 prompt 报 `canvas_missing_prompt`，UI 不发起生成。
- 连到生成节点的图片节点必须先转成当前 project 绑定 conversation 的 `ReferenceImage`，再传 `referenceImageIds`。
- 单节点手动触发只执行一个请求；batch node 存在时只使用第一条非空变体。
- `runCanvasWorkflow()` 支持 8 次请求以内的顺序 workflow run；超过预算整体拒绝，不做半执行。
- 第一版不支持端口体系、复杂 DAG、并发队列、后台批量调度、暂停 / 恢复或 workflow agent。

## 5. 子 feature 清单

1. **canvas-project-shell** — 新增 Canvas 模式入口、默认项目、项目保存恢复和基础无限画布视口。
   - 所属模块：mode-shell、canvas-project-store、canvas-renderer
   - 依赖：无
   - 状态：done
   - 对应 feature：2026-06-05-canvas-project-shell
   - 备注：最小闭环，完成后能进入 Canvas 模式，创建/恢复项目，并完成平移缩放。

2. **canvas-basic-nodes** — 支持文本节点、图片节点、选择拖动、删除和基础连线。
   - 所属模块：canvas-renderer、canvas-node-model
   - 依赖：canvas-project-shell
   - 状态：done
   - 对应 feature：2026-06-05-canvas-basic-nodes

3. **streaming-partial-preview-core** — 打通 adapter 到 store/UI 的流式 partial preview，先在经典工作台展示。
   - 所属模块：streaming-preview-pipeline
   - 依赖：无
   - 状态：done
   - 对应 feature：2026-06-05-streaming-partial-preview-core
   - 备注：复用 `CookSleep/gpt_image_playground` 的 `onPartialImage` 思路，但按 PixAI 现有 adapter/service 分层实现。

4. **canvas-reference-bridge** — 让 Canvas 图片节点和当前参考图体系互通，可把历史图/参考图放入画布并作为生成输入。
   - 所属模块：canvas-node-model、library-reference-integration
   - 依赖：canvas-basic-nodes
   - 状态：done
   - 对应 feature：2026-06-05-canvas-reference-bridge
   - 备注：复用 `reference-image-input` 现状，不新增远程素材实体。

5. **canvas-generate-node** — 生成节点复用现有 `ImageService`，读取连接的 prompt/reference，展示 partial preview 并产出图片节点。
   - 所属模块：canvas-generation-bridge、streaming-preview-pipeline、canvas-node-model
   - 依赖：canvas-basic-nodes、streaming-partial-preview-core、canvas-reference-bridge
   - 状态：done
   - 对应 feature：2026-06-05-canvas-generate-node
   - 备注：第一版只做单节点手动触发，不做完整 DAG 执行器。

6. **canvas-history-gallery-integration** — 为 Canvas 生成结果补齐 history/gallery 入口、来源标识和从图库加入画布能力。
   - 所属模块：library-reference-integration、canvas-generation-bridge
   - 依赖：canvas-generate-node
   - 状态：done
   - 对应 feature：2026-06-05-canvas-history-gallery-integration

7. **canvas-project-import-export** — 支持 Canvas project JSON 导入导出，后续再扩展为带图片文件的项目包。
   - 所属模块：project-package、canvas-project-store
   - 依赖：canvas-history-gallery-integration
   - 状态：done
   - 对应 feature：2026-06-05-canvas-project-import-export
   - 备注：后置能力，第一版不阻塞生成闭环。

8. **canvas-advanced-workflow-nodes** — 增加配置节点、结果节点、批量节点和更完整的 workflow 执行能力。
   - 所属模块：canvas-node-model、canvas-generation-bridge
   - 依赖：canvas-generate-node
   - 状态：done
   - 对应 feature：2026-06-05-canvas-advanced-workflow-nodes
   - 备注：第一版落地为 config / batch / result 节点和 8 次请求以内的顺序 workflow run，不做端口体系、复杂 DAG、并发队列或 workflow agent。

**最小闭环**：第 1 条 `canvas-project-shell` 做完后，用户能从 PixAI 工作台进入 Canvas 模式，创建或恢复一个 Canvas project，并在无限画布中平移、缩放和保存视口状态。

## 6. 排期思路

先做 `canvas-project-shell`，因为用户最先要看到的是工作台里真的多了 Canvas 模式，并且项目能保存恢复。随后做 `canvas-basic-nodes`，让 Canvas 不只是空画布。`streaming-partial-preview-core` 独立提前打通，避免 Canvas 生成节点和经典工作台各自实现一套流式状态。之后再做参考图桥、生成节点、图库/历史互通。导入导出和高级 workflow 节点排在后面，避免第一版范围失控。

技术依赖之外的产品优先级仍可调整：如果用户更想先看到流式 partial preview，也可以把 `streaming-partial-preview-core` 提到第一条 feature 执行，但 roadmap 的最小 Canvas 闭环仍是 `canvas-project-shell`。

## 7. 观察项

- `CanvasArea` 当前命名容易和真正 Canvas 模式混淆；实现阶段建议考虑把当前结果网格重命名为更准确的工作区结果区，但这属于后续 feature 的具体设计，不在 roadmap 中直接改。
- `GenerateImageInput` 当前强依赖 `conversationId`；Canvas project 绑定隐藏或专用 conversation 是本 roadmap 的核心约束，feature-design 时需要明确是否在 UI 展示这类 conversation。
- `reference-image-input` 当前已有 URL 导入和本地参考图能力，Canvas 第一版应优先复用，不要新增平行素材系统。
- `ImageService` 目前只有最终结果返回，流式预览需要改 adapter/service/store/UI 状态链，不只是打开 `partialImages` 参数。
