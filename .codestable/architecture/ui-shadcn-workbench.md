---
doc_type: architecture
slug: ui-shadcn-workbench
scope: PixAI React 前端 UI 基座、经典工作台、Canvas 模式、设置系统、图库和提示词库的当前结构
summary: 前端界面已统一到 Tailwind v4 + shadcn/ui primitives，App 按 view 分流到 WorkspaceShell、CanvasShell 和 SharedLibraryShell 三类外壳，业务状态仍由 Zustand store 提供，经典工作台支持生成中 partial preview，Canvas 是画布优先生图界面，支持浮动 dock、节点动作条、连接到空白创建下游节点、生成节点输入摘要、多结果 result 节点组织、文本一键生成、当前参考图/历史图/图库图/本地图片加入 Canvas、手动单节点生成、history/gallery 来源标识、project JSON 导入导出和有上限的顺序 workflow run。
status: current
last_reviewed: 2026-06-06
tags: [ui, react, shadcn, tailwind, desktop-workbench]
depends_on: []
implements: [reference-image-input]
---

## 0. 术语

- **UI 基座**：`src/index.css`、`src/lib/utils.ts`、`src/components/ui/*` 与 `components.json` 组成的 Tailwind/shadcn 入口。
- **AppTopNav**：Workspace、Canvas、Gallery、Prompt Library 共用的应用级顶部导航，负责品牌、主页面切换、主题切换和全局设置入口。
- **WorkspaceShell**：经典工作台主界面外壳，组合 `AppTopNav`、普通会话侧栏、`Workspace` 和右侧工作区参数栏。
- **CanvasShell**：Canvas 主界面外壳，组合 `AppTopNav`、Canvas project 侧栏和 `CanvasWorkspace`，不渲染工作区参数栏。
- **SharedLibraryShell**：图库和提示词库的共享外壳，只组合 `AppTopNav` 与页面内容，不继承 Workspace 或 Canvas 的模式专属侧栏。
- **工作台主界面**：`App` + `WorkspaceShell` + `Workspace`，负责经典工作台框架、普通会话列表、生成区和右侧参数栏。
- **Partial image preview**：生成过程中从 Provider streaming SSE 事件解析出的中间图，只作为 `generationPreviews` 临时状态展示在经典工作台，不进入 history。
- **Canvas 模式**：`view: 'canvas'` 对应的工作台模式，由 `CanvasShell` 承载项目侧栏，由 `CanvasWorkspace` 与 `CanvasViewport` 承载画布优先界面、浮动生图 dock、默认项目、视口保存恢复、文本/图片/生成/配置/批量/结果节点、节点动作条、连接到空白创建下游节点、生成节点输入摘要、多结果 result 节点组织、轻量连线、当前参考图 / 历史图 / 图库图 / 本地图片加入 Canvas 的素材桥入口、手动生成节点、project JSON 导入导出和顺序 workflow run。
- **Canvas workbench dock**：`CanvasWorkspace` 底部浮动的生图命令层，只承载文本、图片、生成、配置、批量、结果、运行、重置、导入、导出和引导入口；不承载视频或音频命令。
- **CanvasNodeActionToolbar**：节点选中或 hover 时出现的浮动动作条，承载当前节点的生成、预览、mask、运行/重试、连接和删除等高频动作；不持久化 UI 状态。
- **Canvas connection create menu**：从节点开始连接后点击空白画布出现的创建菜单；text/image/result/config/batch 只能创建下游 generate 节点，generate 只能创建下游 result 节点，连接类型仍由 `canvasConnectionKindForNodes()` 判定。
- **Canvas project**：Canvas 本地项目实体，绑定创建或导入时的 `activeConversationId`，当前保存标题、文本/图片/生成/配置/批量/结果节点、轻量连线和 `{ x, y, k }` 视口。
- **Canvas project export JSON**：一个 `CanvasProject` 形状的 JSON 文本快照，供用户从 Canvas toolbar 导出当前项目。
- **Imported Canvas project**：从 JSON 快照克隆出的新本地项目；导入时刷新 project id，绑定当前 active conversation，并重新规范化 nodes/connections/viewport。
- **Canvas reference image node**：由当前会话 `ReferenceImage` 创建的 Canvas 图片节点，`metadata.referenceImageId` 指向参考图。
- **Canvas history image node**：由 history item 经 `reference.addFromHistoryMany()` 导入当前会话参考图后创建的 Canvas 图片节点，`metadata.historyItemId` 保留历史来源，`metadata.referenceImageId` 作为后续生成输入绑定。
- **Canvas generate node**：Canvas 中 `type: 'generate'` 的节点，保存本节点 prompt、运行状态和最近一次 run/history 绑定，可手动触发单节点生成，并在节点内只读展示提示词、参考图、参数、批量和工作流请求摘要。
- **Canvas generation input summary**：由 `summarizeCanvasGenerationInput(project, nodeId)` 从当前 Canvas project snapshot 计算的只读摘要；统计上游 prompt/reference-image/config/batch 和本地 prompt，不读 Provider/history/reference 内容，不写 store。
- **Canvas config node**：Canvas 中 `type: 'config'` 的节点，通过 `config` connection 覆盖目标 generate node 本次请求的 ratio、quality 和 n。
- **Canvas batch node**：Canvas 中 `type: 'batch'` 的节点，通过 `batch` connection 给 workflow run 提供多行 prompt 变体。
- **Canvas result node**：Canvas 中 `type: 'result'` 的节点，通过 `result` connection 接收 generate node 的成功 history item，并可作为下游 reference-image 输入。单次多图或批量结果不会覆盖已承载不同 `historyItemId` 的 result node，而是追加新的 result node。
- **Canvas generated result node**：没有可写 result node 时，生成成功后由 history item 自动创建的 Canvas 结果节点，`metadata.historyItemId` 指向最终结果，并通过 `result` connection 连回 generate node。
- **Bounded Canvas workflow run**：Canvas toolbar 触发的顺序执行；按 project.nodes 顺序展开 generate node 和 batch 变体，一次最多 8 个生成请求，不做 DAG、并发或后台队列。
- **Generation origin**：生成请求来源的可选值对象；经典工作台缺省不写，Canvas 生成节点写 `{ kind: 'canvas', canvasProjectId, canvasNodeId }` 到 run/history。
- **Canvas-origin history item**：由 Canvas generate node 触发并落入现有 history 的记录，图库和工作台卡片通过 `ImageTile` 显示 `Canvas` 来源标识。
- **低频全局设置**：`GlobalSettingsModal` 下的常规、通知、服务、扩展配置，不直接嵌在生图主流程里。

## 1. 定位与受众

这份文档记录 PixAI 当前 React UI 的现状结构，供后续 feature-design、issue-analyze 和 UI 重构时定位边界。它只描述已经落地的 Tailwind/shadcn 工作台，不规划未来 UI。

读完后应能判断：新页面从哪里接入、组件库入口在哪里、主题如何生效、设置系统和工作台高频参数如何分层。

## 2. 结构与交互

### 2.1 UI 基座

`src/main.tsx` 只挂载 `App` 并导入 `src/index.css`，所以全局样式入口集中在一个文件内。`src/main.tsx:1` `src/main.tsx:4`

`src/index.css` 导入 Tailwind、shadcn Tailwind 支持、动画和 Geist 字体，并在 `@theme inline` 中把 CSS variables 映射为 Tailwind 语义 token。`src/index.css:1` `src/index.css:8`

light/dark 主题变量分别定义在 `:root` 和 `.dark`，基础层设置了固定桌面最小尺寸、页面溢出和全局 cursor 规则。`src/index.css:51` `src/index.css:86` `src/index.css:120`

shadcn 配置固定为 TSX、CSS variables、lucide 图标和 `@/components/ui` alias。`components.json:3` `components.json:6` `components.json:13` `components.json:15`

`cn(...)` 是 class 合并入口，组合 `clsx` 与 `tailwind-merge`。`src/lib/utils.ts:1`

### 2.2 应用 Shell 与页面路由

`App` 负责加载应用状态、监听 Tauri 事件、维护全局设置弹窗状态，并根据 `view` 渲染经典工作台、Canvas 模式、图库或提示词库。`src/App.tsx:15` `src/App.tsx:26` `src/App.tsx:109`

主题由 `useAppStore().darkMode` 决定，顶层容器在深色模式时添加 `.dark`，让 `src/index.css` 的变量生效。`src/App.tsx:16` `src/App.tsx:102`

`App` 不再把所有页面包进单一 Layout，而是按 `view` 选择三类 Shell：`workspace` 渲染 `WorkspaceShell`，`canvas` 渲染 `CanvasShell`，`gallery` / `prompts` 渲染 `SharedLibraryShell`。全局设置弹窗仍由 `App` 统一挂载。`src/App.tsx:109` `src/App.tsx:114` `src/App.tsx:119` `src/App.tsx:124`

`AppTopNav` 承载共享品牌和主导航入口，包括工作台、Canvas、图库、提示词库、主题切换和全局设置；模式专属操作通过 Shell 注入，例如 Workspace 的“参数栏”按钮。`src/components/layout/AppTopNav.tsx:8`

`WorkspaceShell` 承载普通会话侧栏、应用更新提示、`Workspace` 主内容和 `SettingsPanel`。`settingsVisible` 和 `toggleSettings()` 只表达 Workspace 参数栏显隐，不改变当前 `view`。`src/components/layout/WorkspaceShell.tsx:15` `src/components/layout/WorkspaceShell.tsx:45` `src/store/app-store.ts:233`

`CanvasShell` 承载 Canvas project 侧栏、项目新建 / 切换 / 删除入口和 `CanvasWorkspace` 主内容。它不导入、不渲染 `WorkspaceConfigPanel` 或“参数栏”按钮。`src/components/layout/CanvasShell.tsx:13`

`SharedLibraryShell` 用于 Gallery 和 Prompt Library，只提供应用级顶部导航和页面容器，不渲染普通会话侧栏或 Canvas project 侧栏。`src/components/layout/SharedLibraryShell.tsx:5`

导航状态、会话操作、Canvas project 操作、主题切换和参数栏显隐仍来自 Zustand store，UI shell 拆分没有改变业务 action 的归属。

### 2.3 工作台生成流

`Workspace` 是生成页容器，只负责选出当前会话、当前会话 runs 和生成状态，再组合 `Composer` 与 `CanvasArea`。`src/components/workspace/Workspace.tsx:5` `src/components/workspace/Workspace.tsx:21`

`Composer` 承载提示词、参考图、灵感/丰富 prompt、生成按钮、提示词放大编辑和参考图预览；提示词编辑先进入组件本地 draft buffer，中文输入法 composition 结束或短延迟后再写回 `useAppStore`，避免异步持久化回写打断中间插入；主提示词输入区可把粘贴、DOM 拖入的图片 `File` 交给 `importReferenceFiles`，也可在 Tauri runtime 中把原生拖放路径读取成 payload 后交给 `importReferencePayloads`。当前参考图缩略图除预览和移除外，还提供“加入 Canvas”按钮，点击后只调用 `useAppStore.addReferenceToCanvas(referenceId)`，不在组件内处理 Canvas project 创建或来源绑定。`src/components/workspace/Composer.tsx:16` `src/components/workspace/Composer.tsx:33` `src/components/workspace/Composer.tsx:164` `src/components/workspace/Composer.tsx:208` `src/components/workspace/Composer.tsx:289` `src/store/app-store.ts:451`

`CanvasArea` 负责把 runs 映射为分页网格条目，生成中占位、失败清理和结果 summary 都在这里汇总。`src/components/workspace/CanvasArea.tsx:21` `src/components/workspace/CanvasArea.tsx:71` `src/components/workspace/CanvasArea.tsx:119`

经典工作台的生成中占位支持流式 partial preview：`CanvasArea` 按 `run.id` 和 `requestIndex` 从 `generationPreviews` 取最新预览传给 `GeneratingTile`，`GeneratingTile` 在方形图片区显示中间图，同时保留生成中 spinner、耗时、重试状态和取消入口。`src/components/workspace/CanvasArea.tsx:27` `src/components/workspace/GeneratingTile.tsx:9`

`ImageTile` 负责单张结果的成功/失败展示、Canvas 来源标识、预览、复制、下载、收藏、删除、作为参考图编辑和加入 Canvas。`src/components/workspace/ImageTile.tsx:13` `src/components/workspace/ImageTile.tsx:65` `src/components/workspace/ImageTile.tsx:110`

`WorkspaceConfigPanel` 右侧工作区设置承载高频生成参数和引擎默认项；引擎卡片可直接切换图片 Provider、提示词 Provider、图片模型、提示词模型和生图端点，保存时回写对应 Provider profile 与当前会话模型。`src/components/settings/workspace/WorkspaceConfigPanel.tsx:44` `src/components/settings/workspace/WorkspaceConfigPanel.tsx:90` `src/components/settings/workspace/WorkspaceConfigPanel.tsx:172`

### 2.3 Canvas 模式

`CanvasShell` 是 Canvas 模式的外层主界面，拥有 Canvas project 侧栏和项目导航；`CanvasWorkspace` 是 Canvas 页面内容容器。它读取 `activeConversationId`，有会话时调用 `useCanvasStore.ensureDefaultProject()` 幂等创建或恢复最近 Canvas project；没有会话时只显示可恢复空状态，不创建无绑定项目。`src/components/layout/CanvasShell.tsx:13` `src/components/canvas/CanvasWorkspace.tsx:8` `src/components/canvas/CanvasWorkspace.tsx:17`

`CanvasViewport` 负责无限画布交互：拖拽平移、滚轮缩放、按钮缩放、重置视图，并把 nodes/connections 交给 `CanvasNodeLayer` 渲染。视口在组件本地先做 draft 更新，提交时交回 Canvas store 持久化；当 `CanvasNodeLayer` 处于连接模式时，背景 pointer down 会先反算世界坐标并交给连接创建菜单接管，不启动 pan。`src/components/canvas/CanvasViewport.tsx:19` `src/components/canvas/CanvasViewport.tsx:36` `src/components/canvas/CanvasViewport.tsx:45`

`CanvasWorkspace` 是画布优先界面：`CanvasViewport` 占满主区域，`CanvasProjectCommandBar` 作为左上浮层显示项目名、节点数、错误状态、导入/导出和引导，`CanvasWorkbenchDock` 作为底部浮层提供文本、图片、生成、配置、批量、结果、运行、重置、导入、导出和引导入口。本地图片仍只读取 `image/*` 文件为 data URL 后写入 Canvas project；项目导入仍读取 `.json` 文件并克隆为当前会话的新 project；“运行”仍调用 `useAppStore.runCanvasWorkflow()`。Dock 不出现视频或音频入口。CanvasWorkspace 的 active project 分支是 flex 容器，确保 CanvasViewport 在真实浏览器中铺满主区域。`src/components/canvas/CanvasWorkspace.tsx:8` `src/components/canvas/CanvasWorkspace.tsx:59` `src/components/canvas/CanvasWorkspace.tsx:137` `src/components/canvas/CanvasWorkspace.tsx:210` `src/components/canvas/CanvasWorkspace.tsx:259`

`CanvasNodeLayer` 渲染文本、图片、生成、配置、批量、结果节点和 SVG 连线，负责节点选择、标题栏拖动、文本编辑、连接 handle、节点动作条、连接创建菜单、删除节点和删除连线。`CanvasNodeActionToolbar` 在节点 hover 或 selected 时出现：text 节点可一键创建下游 generate node 并触发生成；image/result 节点可预览图片和打开 mask 编辑；generate 节点可运行或重试，running 状态不可重复点击；删除节点统一走动作条且仍调用 `deleteNode()` 清理 connections。连接创建菜单在用户从节点开始连接后点击空白画布时出现：text/image/result/config/batch source 只提供 generate 目标，generate source 只提供 result 目标；菜单自身阻止背景 pan，创建目标后调用 `addConnectedNode()` 完成节点创建和自动连线。节点选择态只存在于组件局部，不持久化；生成节点主体由 `CanvasGenerateNodeBody` 承载 prompt、输入摘要、运行按钮、状态、错误和 partial preview；输入摘要由 `CanvasNodeLayer` 基于当前 nodes/connections 组装 project snapshot 后调用 `summarizeCanvasGenerationInput()` 计算。配置、批量、结果节点 body 分别由 `CanvasConfigNodeBody`、`CanvasBatchNodeBody`、`CanvasResultNodeBody` 承载。`src/components/canvas/CanvasNodeLayer.tsx:19` `src/components/canvas/CanvasGenerateNodeBody.tsx:1`

经典工作台和图库复用的 `ImageTile` 在成功图更多菜单中提供“加入 Canvas”入口。该入口调用 `useAppStore.addHistoryToCanvas(historyId)`：先把历史图通过 `pixaiApi.reference.addFromHistoryMany(activeConversationId, [historyId])` 导入当前会话参考图，再确保当前会话有默认 Canvas project，最后创建带 `historyItemId` 与 `referenceImageId` 的 Canvas image node，并切换到 Canvas 视图。当前参考图缩略图则走 `useAppStore.addReferenceToCanvas(referenceImageId)`：它不复制 reference，不调用 `reference.addFromHistoryMany()`，只把已有参考图的 `referenceImageId/storagePath`、安全展示源和基础文件信息写入 Canvas image node；同一参考图重复加入由 `useCanvasStore.addImageNode()` 去重。`src/components/workspace/ImageTile.tsx:23` `src/components/workspace/ImageTile.tsx:186` `src/components/workspace/Composer.tsx:289` `src/store/app-store.ts:608` `src/store/app-store.ts:647`

Canvas generate node 通过 `useAppStore.generateCanvasNode(nodeId)` 手动触发。它复用 `src/services/canvas-workflow.ts` 的计划解析，合并指向当前 generate node 的 incoming `prompt` / `reference-image` / `config` / `batch` connections；单节点运行只执行一个请求，batch node 存在时使用第一条非空变体。缺 binding 的 image/result 节点会先经 `pixaiApi.reference.importPayloads()` 导入当前 project conversation 的参考图；生成请求复用现有 `pixaiApi.image.generate()` / `ImageService` / history 链路，并把 `origin: { kind: 'canvas', canvasProjectId, canvasNodeId }` 透传到 run/history；成功后写入可安全复用的 result node，显式 result node 为空时承载第一张结果，后续不同 `historyItemId` 会自动追加 result node 并建立 `result` connection，避免单次 `n > 1` 或批量结果覆盖。`requestIndex/batchIndex/batchRootId/promptVariant` 只写入 Canvas metadata 供结果编号和批量上下文展示。`src/store/app-store.ts:531` `src/store/canvas-store.ts:164`

生成节点运行前会显示 `CanvasGenerationInputSummary`：非空上游提示词数量、本节点提示词是否存在、可用参考图数量、参数节点数量、批量非空行数量、工作流请求数以及缺提示词警示。这个摘要只用于 UI 可见化，单节点运行仍只取第一条 batch 变体，workflow run 仍按 `buildCanvasWorkflowPlan()` 执行和做 8 次请求预算。`src/services/canvas-workflow.ts:29` `src/services/canvas-workflow.ts:67` `src/components/canvas/CanvasGenerateNodeBody.tsx:75`

`useAppStore.runCanvasWorkflow()` 从 active project 构建 bounded workflow plan：按 project.nodes 顺序选择空闲 generate node，batch node 的非空行会展开为多个请求，超过 8 个请求时整体拒绝且不发起半执行；单个请求失败会标记当前 generate node failed 并继续后续请求。该执行仍不是 DAG 拓扑、并发队列或后台调度。`src/services/canvas-workflow.ts:1` `src/store/app-store.ts:573`

Canvas 模式当前支持节点动作条、连接到空白创建合法下游节点、生成节点输入摘要、多图/批量结果追加 result 节点、文本一键生成、当前参考图/历史图/图库图/本地图片加入 Canvas、图片/结果预览和 mask 编辑、生成节点运行/重试、手动单节点生成、Canvas-origin history/gallery 标识、project JSON 导入导出、配置/批量/结果节点和 8 次请求以内的顺序 workflow run，但不支持端口体系、复杂 DAG 调度、并发队列、后台批量调度、workflow agent、复杂结果分组折叠、从图库跳回 Canvas 节点、节点级取消 UI、带图片资源包的项目包、云同步或批量导入导出。

### 2.4 设置系统

工作区右侧 `WorkspaceConfigPanel` 只承载高频会话参数和当前默认 Provider / 模型 / 生图端点选择，并通过“管理服务”跳到全局 Services 设置。`src/components/settings/workspace/WorkspaceConfigPanel.tsx:41` `src/components/settings/workspace/WorkspaceConfigPanel.tsx:84` `src/components/settings/workspace/WorkspaceConfigPanel.tsx:178`

`GlobalSettingsModal` 使用 shadcn Dialog + Tabs + ScrollArea，按 General、Notifications、Services、Extensions 四个 tab 组织低频应用级配置。`src/components/settings/global/GlobalSettingsModal.tsx:20` `src/components/settings/global/GlobalSettingsModal.tsx:42` `src/components/settings/global/GlobalSettingsModal.tsx:64`

`ServicesSettingsTab` 负责 Provider 默认选择、模型默认值、Provider 列表和 Provider 编辑弹窗入口；它复用 `GallerySelect`、`Input`、`Button`、`Card` 等 primitives。`src/components/settings/global/ServicesSettingsTab.tsx:14` `src/components/settings/global/ServicesSettingsTab.tsx:118` `src/components/settings/global/ServicesSettingsTab.tsx:225`

`ProviderProfileDialog` 是 Provider 创建/编辑表单，使用 Dialog、Input、Label、Button 与 Select 封装。`src/components/settings/providers/ProviderProfileDialog.tsx:20` `src/components/settings/providers/ProviderProfileDialog.tsx:35`

### 2.5 库页面

`GalleryPage` 负责跨会话历史查询、来源关键词搜索、收藏筛选和批量下载/收藏/删除；卡片内容复用 `ImageTile`，因此 Canvas-origin history item 会显示 `Canvas` badge，并保留成功图“加入 Canvas”入口。`src/components/gallery/GalleryPage.tsx:12` `src/components/gallery/GalleryPage.tsx:63`

`PromptLibraryPage` 负责提示词模板查询、新建/编辑、复制、套用和删除，页面级布局使用 Card/Input/Textarea/Button primitives。`src/components/prompts/PromptLibraryPage.tsx:11` `src/components/prompts/PromptLibraryPage.tsx:25` `src/components/prompts/PromptLibraryPage.tsx:82`

## 3. 数据与状态

UI 不直接持久化业务数据。`useAppStore` 仍拥有视图、主题、设置、偏好、会话、runs、history、templates、生成状态、Codex skill 状态和 app update 状态。`src/store/app-store.ts:34` `src/store/app-store.ts:36`

`generationPreviews` 是经典工作台生成中的临时状态，类型为 `GenerationPreviewState = Record<runId, Record<requestIndex, PartialImagePreview>>`。`ImageService` 收到 adapter partial image callback 后补齐 `runId`、`requestIndex`、`receivedAt` 和 data URL；`useAppStore.generate()` / `retryHistory()` 写入 preview，并在 run 完成、失败或取消后清理对应 run/request。`src/shared/types.ts:185` `src/services/image-service.ts:22` `src/store/app-store.ts:62`

流式文本 chunk 的分层职责是：`platform` 只逐段 decode 浏览器 `ReadableStream` 或 Tauri `pixai://http-proxy-stream` chunk 并触发 `onTextChunk`；`openai-compatible` adapter 解析完整 SSE block，识别 `image_generation.partial_image`、`image_edit.partial_image` 和 `response.image_generation_call.partial_image`；最终图片仍由完整响应解析进入 history。`src/lib/platform.ts:24` `src/adapters/openai-compatible.ts:359`

全局初始化通过 `load()` 拉取 settings、preferences、conversations、runs、history 和 templates；UI 页面只消费这些状态并调用 store actions。`src/store/app-store.ts:164`

主题状态是 `darkMode`，切换 action 是 `toggleTheme()`；`App` 把它翻译为 `.dark` class。`src/store/app-store.ts:39` `src/store/app-store.ts:64` `src/store/app-store.ts:194` `src/App.tsx:102`

Canvas project 状态不进入 `useAppStore` 的业务 action 列表。`useCanvasStore` 单独保存项目摘要、当前项目、loading 和错误，并暴露 `loadProjects`、`ensureDefaultProject`、`openProject`、`exportActiveProject`、`importProjectFromJson`、`updateViewport`、`resetViewport` 以及节点/连线 actions：`addTextNode`、`addImageNode`、`addGenerateNode`、`addConfigNode`、`addBatchNode`、`addResultNode`、`createGenerateNodeFromText`、`addConnectedNode`、`updateNodeContent`、`updateNodeMetadata`、`updateGenerateNodeState`、`bindImageNodeReference`、`recordGeneratedResult`、`addGeneratedImageNode`、`moveNode`、`deleteNode`、`addConnection`、`deleteConnection`。`createGenerateNodeFromText(textNodeId)` 会在一次 project mutation 内创建空 generate node 并建立 prompt connection，返回新 generate node id；空文本或非 text node 不写盘。`addConnectedNode({ sourceNodeId, type, position })` 会在一次 project mutation 内创建目标节点，并用 `canvasConnectionKindForNodes(source, target)` 推导连接类型；非法 source、非法目标、重复连接或潜在环路不写盘。`ensureDefaultProject` 带 single-flight 保护，避免 React StrictMode 或 effect 重入时重复创建默认项目；导入成功后 store 会刷新 project summaries 并把 active project 切到导入结果。`src/store/canvas-store.ts:6` `src/store/canvas-store.ts:28` `src/store/canvas-store.ts:101`

Canvas image node metadata 当前可保留 `referenceImageId`、`historyItemId`、`storagePath`、`mimeType`、`fileSizeBytes`、`naturalWidth` 和 `naturalHeight`。`useCanvasStore.addImageNode()` 会把来源绑定字段写入 metadata，并在同一 project 内对相同 `referenceImageId` 或 `historyItemId` 去重，避免重复加入同一参考图或历史图。`src/shared/types.ts:47` `src/store/canvas-store.ts:266` `src/store/canvas-store.ts:280`

`useAppStore.addReferenceToCanvas(referenceImageId)` 是 current reference -> Canvas image node 的编排入口：没有 active Canvas project 时先打开 Canvas workspace；随后从 Canvas project 绑定 conversation、当前 workspace conversation 和现有 conversations 中查找目标参考图；图片展示源统一走 `imageSourceForDisplay(reference.dataUrl, reference.storagePath)`。这个入口不调用 `reference.importPayloads()` 或 `reference.addFromHistoryMany()`，避免把当前参考图复制成新的 reference；如果后续生成节点发现图片节点缺 reference 绑定，仍由 Canvas reference resolution 导入当前 project conversation 并回填绑定。`src/store/app-store.ts:647` `src/store/app-store.ts:676`

Canvas generate node metadata 当前可保留 `status/runId/requestIndex/errorMessage/historyItemId`。Config node metadata 可保留 `ratio/quality/n`，batch node 复用 `content` 存多行 prompt 变体，result node metadata 可保留 `content/status/historyItemId/runId/requestIndex/batchRootId/batchIndex/promptVariant/mimeType/storagePath/referenceImageId`。运行中的 partial preview 仍来自 app-store `generationPreviews`，Canvas project 只保存 run/request 绑定，不保存 preview data URL；生成成功后的最终结果先进入 history，再由 Canvas store 写入可复用 result node 或创建 generated result node。`src/shared/types.ts:45` `src/store/app-store.ts:531` `src/store/canvas-store.ts:164`

`CanvasWorkflowService` 是纯计划层：`buildCanvasGenerationPlanForNode()` 解析单个 generate node 的 prompt/config/batch 输入，`buildCanvasWorkflowPlan()` 解析整个 project 的顺序请求计划、missing prompt、running skip 和 8 次请求预算，`summarizeCanvasGenerationInput()` 解析生成节点的只读输入摘要。它不调用 `ImageService`、不修改 store、不读写 history。`src/services/canvas-workflow.ts:1`

`GenerationOrigin` 是 `GenerateImageInput`、`GenerationRun` 和 `ImageHistoryItem` 上的可选来源字段。`ImageService` 创建 run、成功 history 和失败 history 时透传合法 origin；`AppDatabase` 读取旧数据时会保留合法 `workspace/canvas` origin、清理缺 project/node id 的非法 Canvas origin，并把 `canvas` / `画布` 纳入 history 查询文本。`src/shared/types.ts:8` `src/shared/generation-origin.ts:1` `src/services/image-service.ts:22` `src/services/app-database.ts:133`

`CanvasProjectService` 使用独立本地 state key `pixai-canvas-projects` 保存 `{ projects: CanvasProject[] }`，不修改 conversations、runs 或 history 的持久化结构。服务提供 list/get/exportProject/create/importProject/update/delete，并在读取到无效 Canvas JSON 时记录 `[PixAI Canvas] Invalid canvas project state; resetting.` 后恢复为空项目列表。服务会规范化 nodes/connections：过滤无效图片节点/结果节点、无效端点、自连接和重复连线；图片展示源支持 data URL、http(s)、asset、blob、browser-memory 和本地路径，并保留 `referenceImageId/historyItemId/storagePath/requestIndex/batchRootId/batchIndex/promptVariant` 来源与结果上下文字段。`importProject(input, conversationId)` 把未知 JSON 当不可信输入处理，刷新 project id、绑定传入 conversation、重写时间戳、过滤非法结构，并把导入的 `running` generate/result node 降级为 `idle`，同时清除不会继续完成的运行绑定。`src/services/canvas-projects.ts:6` `src/services/canvas-projects.ts:47` `src/services/canvas-projects.ts:101` `src/services/canvas-projects.ts:188`

Canvas project JSON 文件读写由 `src/lib/platform.ts` 的文本 helper 承担：`downloadTextFile()` 在 Tauri 下走保存对话框 + `write_binary_file`，浏览器下走 object URL 下载；`readTextFile()` 封装 DOM `FileReader`。这些 helper 只处理文本文件，不理解 Canvas project 业务。`src/lib/platform.ts:434` `src/lib/platform.ts:456`

Canvas viewport 由 `CanvasProjectService.normalizeViewport()` 规范化，缩放被限制在 `0.2 <= k <= 3`，非有限数恢复为默认值。`src/services/canvas-projects.ts:108` `src/services/canvas-projects.ts:113`

## 4. 关键决策

- UI 技术栈采用 Tailwind v4 + shadcn/ui，详见 `.codestable/compound/2026-05-24-decision-shadcn-tailwind-ui-stack.md`。这条决策约束后续页面优先扩展 `src/components/ui/*`，不恢复旧 `styles.css`。
- 设置系统继续分为工作区高频参数与全局低频设置。这个边界在总入口已有记录，并由 `WorkspaceConfigPanel` 与 `GlobalSettingsModal` 两个组件实现。`src/components/settings/workspace/WorkspaceConfigPanel.tsx:99` `src/components/settings/global/GlobalSettingsModal.tsx:42`

## 5. 代码锚点

- `src/main.tsx` — React 挂载与全局 CSS 入口。
- `src/index.css` — Tailwind/shadcn 导入、主题 token、dark variables、桌面尺寸基线。
- `components.json` — shadcn 项目配置和 alias。
- `src/components/ui/*` — shadcn primitives 源码。
- `src/lib/utils.ts:cn` — Tailwind class 合并工具。
- `src/App.tsx:App` — 应用生命周期、主题 class、全局设置弹窗、按 `view` 选择页面 Shell。
- `src/components/layout/AppTopNav.tsx:AppTopNav` — 共享品牌、主导航、主题切换和全局设置入口。
- `src/components/layout/WorkspaceShell.tsx:WorkspaceShell` — 经典工作台 shell、普通会话侧栏和工作区参数栏挂载。
- `src/components/layout/CanvasShell.tsx:CanvasShell` — Canvas shell、Canvas project 侧栏和 CanvasWorkspace 挂载。
- `src/components/layout/SharedLibraryShell.tsx:SharedLibraryShell` — Gallery / Prompt Library 共享 shell。
- `src/components/workspace/Workspace.tsx:Workspace` — 工作台组合入口。
- `src/components/workspace/CanvasArea.tsx:CanvasArea` — 经典工作台 runs 网格、生成占位、partial preview 挂载和分页。
- `src/components/workspace/GeneratingTile.tsx:GeneratingTile` — 生成中卡片、retry 状态、取消入口和 partial preview 图片展示。
- `src/components/workspace/ImageTile.tsx:ImageTile` — 结果图卡片、更多菜单、“作为参考图编辑”和“加入 Canvas”入口。
- `src/shared/generation-origin.ts` — generation origin normalize、Canvas 判定和来源搜索文本。
- `src/lib/platform.ts:fetchTextStreamThroughPlatform` — 浏览器/Tauri 流式文本 chunk 管道。
- `src/lib/platform.ts:downloadTextFile` / `readTextFile` — 浏览器/Tauri 文本文件导出和 DOM 文件读取 helper。
- `src/adapters/openai-compatible.ts:openAiCompatibleAdapter` — OpenAI compatible images/responses SSE 解析和 partial image callback。
- `src/services/image-service.ts:ImageService` — run/request 级生成编排、最终 history 落库和 partial preview 语义补齐。
- `src/components/canvas/CanvasWorkspace.tsx:CanvasWorkspace` — Canvas 模式画布优先页面容器、默认项目创建/恢复、项目 command bar、生图 dock、项目 JSON 导入导出和空状态。
- `src/components/canvas/CanvasViewport.tsx:CanvasViewport` — 空无限画布视口、平移缩放、重置控件和连接模式下的空白点击接管。
- `src/components/canvas/CanvasNodeLayer.tsx:CanvasNodeLayer` — 文本/图片/生成节点、SVG 连线、选择、拖动、节点动作条、连接创建菜单、删除和连接 handle。
- `src/components/canvas/CanvasGenerateNodeBody.tsx:CanvasGenerateNodeBody` — 生成节点主体、输入摘要、运行按钮、状态、错误和 partial preview 展示。
- `src/components/canvas/CanvasConfigNodeBody.tsx:CanvasConfigNodeBody` — 配置节点 ratio / quality / n 覆盖 UI。
- `src/components/canvas/CanvasBatchNodeBody.tsx:CanvasBatchNodeBody` — 批量节点 prompt 变体编辑 UI。
- `src/components/canvas/CanvasResultNodeBody.tsx:CanvasResultNodeBody` — 结果节点状态、history 绑定、请求/批量编号和最终图展示 UI。
- `src/store/canvas-store.ts:useCanvasStore` — Canvas project 独立 Zustand store。
- `src/services/canvas-projects.ts:CanvasProjectService` — Canvas project 本地持久化服务、导入导出 clone 和 viewport 规范化。
- `src/services/canvas-workflow.ts` — Canvas workflow 纯计划解析、生成节点输入摘要、batch 展开和 request budget。
- `src/store/app-store.ts:addHistoryToCanvas` — history -> reference -> Canvas image node 的跨 store 编排入口。
- `src/store/app-store.ts:addReferenceToCanvas` — 当前参考图 -> Canvas image node 的跨 store 编排入口。
- `src/store/app-store.ts:generateCanvasNode` — Canvas generate node -> ImageService/history -> Canvas result node 的跨 store 编排入口。
- `src/store/app-store.ts:runCanvasWorkflow` — Canvas bounded workflow run 的跨 store 编排入口。
- `src/services/app-api.ts:createPixaiApi` — `pixaiApi.canvas` 门面挂载点。
- `src/components/settings/workspace/WorkspaceConfigPanel.tsx:WorkspaceConfigPanel` — 高频生图参数栏。
- `src/components/settings/global/GlobalSettingsModal.tsx:GlobalSettingsModal` — 低频全局设置容器。

## 6. 已知约束 / 边界情况

- UI 重写不得改变 `useAppStore` actions 的业务语义；视觉组件从 store 读取或调用 action，但不重新定义持久化边界。`src/store/app-store.ts:60`
- 高频生图参数必须在工作区一层可达；Provider 完整维护在全局 Services tab 内。`src/components/settings/workspace/WorkspaceConfigPanel.tsx:121` `src/components/settings/global/ServicesSettingsTab.tsx:118`
- 主模式页面使用专属 Shell，跨模式共享页使用 Shared Shell；不要把模式专属侧栏或参数面板塞进单一全局 Layout。
- 工作区参数栏只属于 WorkspaceShell。CanvasShell 不渲染 `WorkspaceConfigPanel` 或“参数栏”按钮；Canvas 未来的 inspector / project panel 需要使用 Canvas 专属状态和组件。
- Gallery / Prompt Library 只使用 SharedLibraryShell，不继承普通会话侧栏或 Canvas project 侧栏。
- Canvas workbench dock 只承载生图相关命令：文本、图片、生成、配置、批量、结果、运行、重置、导入、导出和引导；不得引入视频或音频入口。
- 应用是桌面工作台，当前 CSS 基线设置了 `1080px × 720px` 最小尺寸，不按移动端响应式重排。`src/index.css:126`
- 隐藏文件上传 input 仍保留在 `Composer` 中，因为浏览器文件选择能力需要真实 file input 作为入口；粘贴 / 拖入图片只是新增入口，不能替代文件选择控件。Windows Tauri 默认文件拖放会先进入原生 `onDragDropEvent`，不能只依赖 HTML5 `DataTransfer.files`。`src/components/workspace/Composer.tsx:71` `src/components/workspace/Composer.tsx:167`
- Canvas project 绑定进入 Canvas 或导入项目时的当前会话，不创建隐藏会话，不改变会话列表语义；后续生成节点如果需要一项目一会话，需要单独 feature 明确迁移策略。
- Canvas 模式当前提供 project shell、画布优先 viewport、底部生图 dock、文本/图片/生成/配置/批量/结果节点、节点动作条、连接到空白创建合法下游节点、生成节点输入摘要、多图/批量结果追加 result 节点、基础连线、当前参考图/历史图/图库图/本地图片到 Canvas image/result node 的桥接、文本一键生成、手动单节点生成、Canvas-origin history/gallery 标识、Canvas project JSON 导入导出，以及 8 次请求以内的顺序 workflow run；仍不支持端口体系、复杂 DAG 调度、并发队列、后台批量调度、workflow agent、复杂结果分组折叠、从图库跳回 Canvas 节点、节点级取消 UI、视频/音频节点、带图片资源包的项目包、云同步或批量导入导出。
- 从当前参考图加入 Canvas 不复制 reference，只保存 `referenceImageId/storagePath` 绑定和安全展示源；同一参考图重复加入由 Canvas store 去重。
- Canvas project 导入永远 clone 为新 project，不覆盖已有项目，不复用 JSON 内 project id；导入只接受 schemaVersion 1 或缺省 schema，且 running generate/result node 会降级为 idle，避免恢复不会结束的旧运行态。
- 图片节点当前可把 data URL 或可展示路径保存在 project JSON 中；`referenceImageId/historyItemId/storagePath` 只做来源绑定和后续生成输入准备，不新增素材文件清理策略。
- 从 history 加入 Canvas 必须先经 `reference.addFromHistoryMany()` 导入当前会话参考图，不能绕过现有参考图数量、格式和大小限制。
- Canvas 生成节点只使用连到当前 generate node 的 prompt/reference-image/config/batch connections；不会默认携带当前会话全部参考图。缺 binding 的 Canvas image/result 节点必须先经 `reference.importPayloads()` 导入当前 project conversation。
- Canvas workflow run 超过 8 个请求时整体拒绝，不进入半执行；它只做顺序执行，不做拓扑排序、并发、持久队列、暂停/恢复或 agent 调度。
- Canvas generation origin 只作为 run/history 的可选来源指针，不改变 referenceImages 或 Canvas project 内容；经典工作台生成和 `retryHistory()` 不主动继承 Canvas origin。
- Partial preview 只服务经典工作台生成中的视觉反馈；它不进入 history、reference、gallery 或 Canvas project，provider 不返回 partial 时 UI 保持原有 spinner。
- Stream observer / partial callback 异常必须被吞掉，不能打断最终图片生成和 history 落库。

## 7. 相关文档

- `.codestable/compound/2026-05-24-decision-shadcn-tailwind-ui-stack.md`
- `.codestable/roadmap/shadcn-ui-rewrite/shadcn-ui-rewrite-roadmap.md`
- `.codestable/roadmap/shadcn-ui-rewrite/shadcn-ui-rewrite-items.yaml`
