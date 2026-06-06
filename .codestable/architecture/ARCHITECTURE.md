# PixAI Tauri 架构总入口

> 状态：已更新
> 创建日期：2026-05-23

## 1. 项目简介

PixAI rebuilt as a Tauri 2 desktop app.

## 2. 核心概念 / 术语表

- **UI 基座**：Tailwind v4 + shadcn/ui primitives + `src/index.css` 主题 token 组成的前端视觉和交互组件基础。
- **AppTopNav**：Workspace / Canvas / Gallery / Prompt Library 共用的应用级顶部导航，承载品牌、主页面切换、主题切换和全局设置入口；模式专属按钮由对应 Shell 注入。
- **WorkspaceShell**：经典工作台主界面外壳，承载普通会话侧栏、`Workspace` 主内容和 Workspace 专属工作区参数栏入口。
- **CanvasShell**：Canvas 主界面外壳，承载 Canvas project 侧栏和 `CanvasWorkspace` 主内容，不渲染工作区参数栏。
- **SharedLibraryShell**：图库和提示词库的共享外壳，只提供应用级顶部导航和页面容器，不继承 Workspace 或 Canvas 的模式专属侧栏。
- **工作区参数栏**：WorkspaceShell 右侧的高频参数编辑层，仅承载当前会话的生图参数与引擎选择。
- **Canvas 模式**：与经典工作台同级的工作台模式，由 CanvasShell 承载项目级导航，由 CanvasWorkspace 承载画布优先界面、底部生图 dock、右侧画布助手、本地 Canvas project、默认项目创建/恢复、无限画布视口、文本 / 图片 / 生成 / 配置 / 批量 / 结果节点、节点动作条、连接到空白创建下游节点、生成节点输入摘要、多结果 result 节点组织、轻量连线、当前参考图 / 历史图 / 图库图 / 本地图片加入 Canvas 的素材桥、文本一键生成、手动单节点生成、Canvas project JSON 导入导出，以及有上限的顺序 workflow run。
- **画布助手**：CanvasWorkspace 右侧常驻的会话内调度面板，通过本地规则解析用户命令，顺序调用 Canvas store / app-store 的节点创建、连接、提示词修改、生成运行和 workflow 运行能力。
- **流式 partial preview**：Provider 流式生成过程中的中间图预览，按 `runId/requestIndex` 临时显示在经典工作台生成占位卡片中，不写入 history。
- **全局设置窗**：应用级低频配置层，承载通知、更新、服务配置、Codex 扩展等全局状态。
- **Provider 管理流**：在全局设置窗内维护图片 / 提示词 Provider 的默认选择、列表维护与编辑弹窗。
- **应用更新流**：桌面端运行时版本读取、启动静默检查、设置页手动检查、Tauri updater 安装与 GitHub fallback 的统一编排。

## 3. 子系统 / 模块索引

- **前端工作台布局**
  - `src/App.tsx`
  - `src/components/layout/AppTopNav.tsx`
  - `src/components/layout/WorkspaceShell.tsx`
  - `src/components/layout/CanvasShell.tsx`
  - `src/components/layout/SharedLibraryShell.tsx`
  - 负责按 `view` 分发经典工作台、Canvas 和共享库页面三类外壳；WorkspaceShell 管理普通会话侧栏和右侧工作区参数栏，CanvasShell 管理 Canvas project 侧栏，SharedLibraryShell 管理图库 / 提示词库共享页面容器；全局设置窗仍由 `App` 统一挂载。
- **shadcn 工作台 UI 架构**
  - `.codestable/architecture/ui-shadcn-workbench.md`
  - `src/index.css`
  - `src/components/ui/`
  - `src/lib/utils.ts`
  - 负责记录 Tailwind/shadcn 基座、主题 token、App shell、经典工作台、Canvas 模式、设置和库页面的当前结构。
- **Canvas project shell / basic nodes / node action toolbar / connection authoring / generation context / result composition / reference bridge / generate node / history gallery integration / project import-export / advanced workflow nodes / canvas assistant**
  - `src/components/canvas/`
  - `src/store/canvas-store.ts`
  - `src/services/canvas-projects.ts`
  - `src/services/canvas-workflow.ts`
  - `src/services/canvas-assistant.ts`
  - `src/lib/platform.ts`
  - `src/shared/generation-origin.ts`
  - `src/services/image-service.ts`
  - `src/services/app-database.ts`
  - `src/store/app-store.ts`
  - `src/components/gallery/GalleryPage.tsx`
  - `src/components/workspace/ImageTile.tsx`
  - `src/services/app-api.ts`
  - 负责 Canvas 模式入口、画布优先 workspace、底部生图 dock、右侧画布助手、默认项目创建/恢复、本地 `pixai-canvas-projects` 状态、`{ x, y, k }` 视口持久化、文本/图片/生成/配置/批量/结果节点、节点动作条、轻量连线、连接到空白创建合法下游节点、助手指令解析与执行回执、生成节点输入摘要、多图/批量生成结果追加 result 节点、文本节点一键创建下游生成节点、图片/结果节点预览和 mask、生成节点运行/重试、从当前参考图、历史成功图、图库图或本地图片创建带来源绑定的 Canvas 图片节点、手动单节点生成到 history/Canvas result node 的桥接、Canvas-origin history/gallery 标识与来源搜索、Canvas project JSON 文本导入导出，以及 8 次请求以内的顺序 workflow run。
- **流式预览链路**
  - `src/lib/platform.ts`
  - `src/adapters/openai-compatible.ts`
  - `src/services/image-service.ts`
  - `src/store/app-store.ts`
  - `src/components/workspace/CanvasArea.tsx`
  - `src/components/workspace/GeneratingTile.tsx`
  - 负责从平台 stream chunk、Provider SSE partial event 到经典工作台生成中图片预览的临时状态链。
- **设置系统**
  - `src/components/settings/workspace/`
  - `src/components/settings/global/`
  - `src/components/settings/providers/`
  - 负责把“当前会话参数”和“应用级设置”拆成两层编排。
- **应用更新系统**
  - `src/services/app-update.ts`
  - `src/store/app-store.ts`
  - `src/components/settings/AppUpdateSection.tsx`
  - `src-tauri/tauri.conf.json`
  - 负责运行时版本展示、OS / arch / installerType 平台识别、更新检查、更新下载安装与 GitHub fallback。
- **本地 updater 验证工具**
  - `scripts/local-updater.mjs`
  - `scripts/updater-artifacts.mjs`
  - `src-tauri/tauri.local-updater.conf.json`
  - `README.md`
  - 负责在不上传 GitHub Release 的前提下，生成本地签名更新包、跨平台 `latest.json` 和本地 feed。
- **正式 updater 发布工具**
  - `scripts/release-updater.mjs`
  - `scripts/updater-artifacts.mjs`
  - `src-tauri/tauri.conf.json`
  - `README.md`
  - 负责用长期公私钥生成正式签名更新包、合并 GitHub Release `latest.json` 平台条目并上传现有 release 资产。

## 4. 关键架构决定

- 前端 UI 栈采用 Tailwind v4 + shadcn/ui，shadcn primitives 进入 `src/components/ui/` 作为项目源码层；详见 `.codestable/compound/2026-05-24-decision-shadcn-tailwind-ui-stack.md`。
- 设置系统采用双层结构：右侧 `WorkspaceConfigPanel` 负责高频会话参数，`GlobalSettingsModal` 负责低频应用级配置。
- 主界面外壳采用专属 Shell：`App` 按 `view` 选择 WorkspaceShell / CanvasShell / SharedLibraryShell，模式专属侧栏和参数面板不塞进单一全局 Layout。
- CanvasWorkspace 的节点命令以生图 dock 呈现，dock 只承载文本、图片、生成、配置、批量、结果、运行、重置、导入、导出和引导，不引入视频或音频入口。
- CanvasWorkspace 的画布助手是 Canvas 专属右侧面板，不复用 Workspace 参数栏；助手调度器是本地纯解析服务，不直接调用 Provider、prompt API 或外部 AI。
- Canvas 节点高频操作以 `CanvasNodeActionToolbar` 呈现，动作条只在节点 hover / selected 时出现，承载文本一键生成、图片/结果预览与 mask、生成运行/重试、连接和删除；动作条不持久化 UI 状态，也不引入视频或音频入口。
- Canvas 连接到空白处只创建当前生图链路合法下游节点：text/image/result/config/batch 创建 generate，generate 创建 result；连接类型由 `canvasConnectionKindForNodes()` 判定，不创建空 image，不引入视频或音频入口。
- Canvas 生成节点输入摘要由 `src/services/canvas-workflow.ts` 的纯函数从当前 project snapshot 计算，只展示上游提示词、参考图、参数、批量变体和工作流请求数；不得写入 Canvas project、不得读取 Provider/history/reference 内容、不得改变生成执行语义。
- Canvas 生成结果组织以 `historyItemId` 为最终事实源；显式 result node 为空或绑定同一 history item 时可复用，已承载不同结果时不得覆盖，必须追加新的 result node 并建立 `result` connection。`requestIndex/batchIndex/batchRootId/promptVariant` 只增强 Canvas 展示，不改变 history 或 Provider 结构。
- Provider 维护不再和工作区参数混排，而是作为 `Services` 分区内的独立管理流存在。
- 更新、通知权限、技能安装统一按状态卡表达，减少和普通表单字段的视觉冲突。
- 正式更新源与本地验证更新源分离：正式分发继续走 GitHub Release，本地验证通过独立脚本和本地 HTTP feed 完成。
- updater 平台目标采用跨平台模型：Windows 按安装器保留 `windows-x86_64-msi/nsis`，macOS 按架构使用 `darwin-aarch64/x86_64`。
- macOS 手动安装资产是 `.dmg`，Tauri updater 资产是 `.app.tar.gz` 加同名 `.sig`；发布脚本会同时 staging 手动安装包和 updater 包。
- Windows 和 macOS 可以在不同机器上分开发同一 tag；正式发布脚本会在同版本下合并已有 `latest.json` 的 `platforms`，避免覆盖另一平台条目。
- 正式 updater 私钥只保存在本机 gitignored 的 `artifacts/release-updater/keys/`；仓库只提交公钥。
- 流式 partial preview 按 platform → adapter → ImageService → app store → UI 分层传递；adapter 不知道 run 语义，ImageService 负责补齐 `runId/requestIndex`。
- Canvas 生成来源按 `GenerationOrigin` 可选字段保存在 `GenerationRun` / `ImageHistoryItem`，Gallery 优先读取 history item 来源而不是反查 Canvas project。
- Canvas project 导入导出第一版只处理 JSON 文本快照；导入永远 clone 为新 project，刷新 project id，并绑定当前 active conversation。
- Canvas workflow run 和生成节点输入摘要由 `src/services/canvas-workflow.ts` 做纯计划解析，`app-store` 只按计划顺序调用现有 `ImageService` 链路；超过 8 次请求会整体拒绝，不做半执行，摘要不绕过该预算。

## 5. 已知约束 / 硬边界

- 高频生图参数必须在工作区一层内可达，不能被多级导航或二级弹窗包裹。
- 工作区参数栏只属于 WorkspaceShell；CanvasShell 不导入或渲染 `WorkspaceConfigPanel`，Canvas 未来的 inspector / project panel 需要使用 Canvas 专属状态和组件。
- 画布助手只操作 active Canvas project 的当前页面会话状态；助手消息不写入 Canvas project JSON，不作为跨 project 调度入口。
- Gallery / Prompt Library 使用 SharedLibraryShell，不继承普通会话侧栏或 Canvas project 侧栏；共享页只复用应用级导航、主题和全局设置入口。
- Canvas dock 只承载生图相关命令，不新增视频/音频节点、按钮或导入入口。
- UI 样式入口是 `src/index.css` 与 `src/components/ui/*`；不应恢复旧 `src/styles.css` 作为并行样式体系。
- 打开全局设置窗不能打断当前会话上下文，也不能清空正在编辑的 prompt。
- Canvas project 绑定创建或导入时的当前会话，不创建隐藏会话；当前支持文本/图片/生成/配置/批量/结果节点、右侧画布助手、节点动作条、连接到空白创建合法下游节点、生成节点输入摘要、多图/批量结果追加 result 节点、轻量连线、当前参考图/历史图/图库图/本地图片到 Canvas image/result node 的桥接、文本一键生成、手动单节点生成、图库来源标识、JSON 导入导出和 8 次请求以内的顺序 workflow run；不支持端口体系、复杂 DAG 调度、并发队列、后台批量调度、workflow agent、复杂结果分组折叠、从图库跳回 Canvas 节点、节点级取消 UI、视频/音频节点或助手动作、带图片资源包的项目包、云同步或批量导入导出。
- 从当前参考图加入 Canvas 不复制 reference，只保存 `referenceImageId/storagePath` 绑定和安全展示源；同一参考图重复加入由 Canvas store 去重。
- 从 history 加入 Canvas 必须复用现有 `reference.addFromHistoryMany()`，由 reference 链路继续维护数量、格式和大小限制；Canvas 只保存 `referenceImageId/historyItemId/storagePath` 绑定。
- Canvas 生成节点必须复用现有 `ImageService` / history 链路；请求只使用连到当前 generate node 的 prompt/reference，缺 binding 的图片节点先导入当前 project conversation 参考图。
- 流式 partial preview 是临时 UI 状态；完成、失败或取消后清理，不写入 history、reference、gallery 或 Canvas project。
- 本地通知、更新、服务配置和扩展属于全局层，不应重新回流到工作区参数栏。
- GitHub fallback 仅在 Tauri updater 源异常时触发；“正常无更新”不应被重定向到 GitHub。
- 本地 updater feed 仅用于验证，不应覆盖正式发布配置。
