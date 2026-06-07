---
doc_type: roadmap
slug: canvas-agent-v1
status: completed
created: 2026-06-07
last_reviewed: 2026-06-07
tags: [canvas, agent, tool-calling]
related_requirements: [canvas-assistant]
related_architecture: [ARCHITECTURE, ui-shadcn-workbench]
---

# Canvas Agent V1

## 1. 背景

当前 Canvas Assistant 主要依靠本地正则命令解析，能执行显式命令，但无法作为真正的 Canvas agent 理解开放式意图、按工具调用逐步检查画布、定位节点、生成候选变更并解释执行过程。

Canvas Agent V1 的目标是把 Canvas 的核心能力作为一组受控工具暴露给支持原生 tool calling 的 Agent Provider：模型负责规划和选择工具，应用负责执行、权限、状态一致性、运行日志和 UI 反馈。V1 优先性能与稳定性，先覆盖任务级 Canvas 操作，不暴露删除、批量破坏性操作或复杂 workflow 编排。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- 独立 Canvas Agent Provider 配置与运行时选择，不复用 Prompt Provider 语义。
- OpenAI-compatible Responses API 原生 tool calling adapter 契约。
- Canvas 结构化摘要与按需 inspect 工具。
- Canvas tool registry、权限分级、参数校验、错误恢复和有限 tool loop。
- pending change/proposal 模型，尤其是提示词丰富只生成候选，不自动覆盖。
- Canvas Assistant Panel 接入 Agent Runner，展示 Run Timeline、pending change 操作、节点 focus/highlight。
- 保留 legacy regex fallback，在未配置 Agent Provider 或 provider 不支持时仍可执行旧显式命令。
- 单元测试、组件测试、类型检查与必要的回归验证。

### 明确不做

- 不做删除节点/连接、批量删除、导入/导出、mask 编辑、批量多节点突变。
- 不做 JSON plan fallback；V1 只支持原生 tool calling。
- 不做 workflow 全局智能编排；保留已有 `runCanvasWorkflow`，但 Agent V1 不主动暴露复杂批处理策略。
- 不做长期对话记忆或跨项目 Agent memory。
- 不做多 provider tool calling 方言；V1 以 OpenAI-compatible Responses API 工具调用为准。

## 3. 模块拆分（概设）

```
Canvas Agent V1
├── Provider/Profile：新增 agent usage、默认 Agent Provider 选择与配置 UI
├── Adapter Contract：定义 Canvas Agent 请求/响应/tool call 类型并实现 OpenAI-compatible adapter
├── Canvas Context：生成结构化画布摘要与节点/生成上下文 inspect 结果
├── Tool Registry：声明工具 schema、权限等级、执行结果和参数校验
├── Agent Runner：有限 tool loop、错误恢复、timeline 事件、abort/budget 控制
├── Pending Changes：候选提示词变更、确认应用和取消
├── Assistant UI：对话输入、timeline、pending action、节点 focus/highlight、legacy fallback
└── Acceptance Hardening：测试、类型检查、文档回写和回归收口
```

### Provider/Profile

- **职责**：让用户单独配置/选择 Canvas Agent Provider，并确保只有支持 agent tool calling 的 profile 可被选中。
- **承载的子 feature**：`canvas-agent-provider-settings`
- **触碰的现有代码 / 模块**：`src/shared/types.ts`、`src/services/provider-settings.ts`、`src/components/settings/*`、相关测试。

### Adapter Contract

- **职责**：为 Agent Runner 提供统一模型调用接口，隐藏 Responses API 具体 payload 和 tool call 解析。
- **承载的子 feature**：`canvas-agent-adapter-contract`
- **触碰的现有代码 / 模块**：`src/adapters/types.ts`、`src/adapters/openai-compatible.ts`、`src/services/app-api.ts` 或新增 `src/services/canvas-agent-service.ts`。

### Canvas Context

- **职责**：把 Canvas project 转成短摘要，并提供 inspect 工具读取节点详情和生成上下文。
- **承载的子 feature**：`canvas-agent-state-summary`
- **触碰的现有代码 / 模块**：新增 `src/services/canvas-agent-context.ts`，复用 `canvas-workflow.ts`。

### Tool Registry

- **职责**：集中定义 V1 工具、参数 schema、权限等级、执行函数和标准化结果。
- **承载的子 feature**：`canvas-agent-tool-registry`
- **触碰的现有代码 / 模块**：新增 `src/services/canvas-agent-tools.ts`，调用 Canvas store/app store 提供的 executor。

### Agent Runner

- **职责**：执行最多 8 次 tool call 的有限循环，处理未知工具/非法参数/工具错误/预算耗尽，并向 UI 发出 timeline。
- **承载的子 feature**：`canvas-agent-runner`
- **触碰的现有代码 / 模块**：新增 `src/services/canvas-agent-runner.ts`，集成 adapter contract、tool registry、context。

### Pending Changes

- **职责**：把 `propose_prompt_enrichment` 等候选变更保存为运行态 pending change，等待用户确认后应用。
- **承载的子 feature**：`canvas-agent-pending-changes`
- **触碰的现有代码 / 模块**：新增 pending change 类型/工具执行逻辑，UI 操作按钮接入 `apply_pending_change` / `cancel_pending_change`。

### Assistant UI

- **职责**：把当前右侧助手从“正则命令面板”升级为 Agent 面板，展示模型响应、timeline、pending 操作和节点定位高亮。
- **承载的子 feature**：`canvas-agent-assistant-ui`、`canvas-agent-legacy-fallback`
- **触碰的现有代码 / 模块**：`CanvasAssistantPanel.tsx`、`CanvasWorkspace.tsx`、`CanvasViewport.tsx`、`CanvasNodeLayer.tsx`。

### Acceptance Hardening

- **职责**：补齐测试、校验和 CodeStable 回写，确保 Canvas Agent V1 完整闭环。
- **承载的子 feature**：`canvas-agent-v1-acceptance-hardening`
- **触碰的现有代码 / 模块**：测试文件、architecture/requirements 现状回写。

## 4. 模块间接口契约 / 共享协议（架构层详设）

### 4.1 Provider Settings 扩展

**方向**：Settings UI / App Store -> ProviderSettingsStore -> Adapter
**形式**：共享 TypeScript 类型 + store 方法

**契约**：

```ts
export type ProviderUsage = 'image' | 'prompt' | 'agent'

export type AdapterCapability =
  | 'text-to-image'
  | 'image-to-image'
  | 'prompt-assist'
  | 'canvas-agent'
  | 'native-tool-calling'
  | 'connection-test'
  | 'streaming'
  | 'input-fidelity'

export type ProviderSettings = {
  profiles: ProviderProfile[]
  selectedImageProfileId: string
  selectedPromptProfileId: string
  selectedAgentProfileId: string
}

export type ProviderSettingsUpdate = Partial<
  Pick<ProviderSettings, 'selectedImageProfileId' | 'selectedPromptProfileId' | 'selectedAgentProfileId'>
>
```

**约束**：

- `selectedAgentProfileId` 必须指向 `enabledUsages.includes('agent')` 且能力包含 `canvas-agent`/`native-tool-calling` 的 profile；没有时为空字符串。
- 旧 settings 缺少 `selectedAgentProfileId` 时 normalize 为 `''` 或第一个 agent-compatible profile。
- 新建 profile 默认可选择 `image/prompt/agent` 组合，但只有 agent usage 才显示 Agent 模型字段。

### 4.2 Adapter Agent 调用

**方向**：Agent Runner -> ProviderAdapter
**形式**：函数调用

**契约**：

```ts
export type CanvasAgentToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type CanvasAgentChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: CanvasAgentToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string; name: string }

export type CanvasAgentToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type CanvasAgentTurnRequest = {
  messages: CanvasAgentChatMessage[]
  tools: CanvasAgentToolDefinition[]
  signal?: AbortSignal
}

export type CanvasAgentTurnResponse = {
  content: string
  toolCalls: CanvasAgentToolCall[]
  raw?: unknown
}

interface ProviderAdapter {
  runCanvasAgentTurn?(
    profile: ProviderRuntimeProfile,
    request: CanvasAgentTurnRequest
  ): Promise<CanvasAgentTurnResponse>
}
```

**约束**：

- Adapter 必须只返回已解析的 `toolCalls`，非法 JSON 参数在 adapter 层尽量解析为空对象或抛出明确错误。
- Runner 仍需再次校验工具名和参数对象，不能信任模型输出。
- V1 不实现非原生 tool calling fallback。

### 4.3 Canvas Agent Context

**方向**：CanvasWorkspace/Runner -> Context service -> Adapter prompt/tools
**形式**：纯函数

**契约**：

```ts
export type CanvasAgentStateSummary = {
  projectId: string
  title: string
  nodeCount: number
  connectionCount: number
  nodes: Array<{
    id: string
    type: CanvasNodeType
    title: string
    label: string
    contentPreview: string
    status?: CanvasNodeStatus
    position: CanvasPoint
  }>
  connections: Array<{
    id: string
    fromNodeId: string
    toNodeId: string
    kind: CanvasConnectionKind
  }>
}

export function summarizeCanvasForAgent(project: CanvasProject): CanvasAgentStateSummary
export function inspectCanvasNode(project: CanvasProject, nodeId: string): CanvasAgentNodeInspection
export function inspectCanvasGenerationContext(project: CanvasProject, nodeId: string): CanvasAgentGenerationInspection
```

**约束**：

- Summary 必须限制长文本，只给 preview；详细内容通过 inspect 工具读取。
- inspect 返回稳定 JSON，可直接作为 tool result。

### 4.4 Tool Registry

**方向**：Runner -> Tool Registry -> Canvas Tool Executor
**形式**：工具定义与执行接口

**契约**：

```ts
export type CanvasAgentToolPermission = 'auto' | 'confirm'

export type CanvasAgentToolContext = {
  getProject(): CanvasProject | null
  createNode(input: CanvasNodeCreateInput): Promise<CanvasNodeData | null>
  updateNodeContent(nodeId: string, content: string): Promise<void>
  addConnection(fromNodeId: string, toNodeId: string): Promise<void>
  createGenerateNodeFromText(nodeId: string): Promise<string | null>
  generateCanvasNode(nodeId: string): Promise<void>
  enrichTextPrompt(input: { nodeId: string }): Promise<string>
  focusNode(nodeId: string): void
  setPendingChange(change: CanvasAgentPendingChange): void
  getPendingChange(id: string): CanvasAgentPendingChange | null
  clearPendingChange(id: string): void
}

export type CanvasAgentToolResult = {
  ok: boolean
  message: string
  data?: unknown
  focusNodeId?: string
  pendingChange?: CanvasAgentPendingChange
}
```

**V1 工具清单**：

- `list_canvas_state`
- `inspect_node`
- `inspect_generation_context`
- `focus_node`
- `create_text_node`
- `create_generate_node`
- `create_text_to_generate_chain`
- `connect_nodes`
- `generate_from_text_node`
- `run_generate_node`
- `propose_prompt_enrichment`
- `apply_pending_change`
- `confirm_tool_plan`
- `cancel_pending_change`

**约束**：

- V1 所有 mutation 顺序执行，不并发。
- `propose_prompt_enrichment` 不允许自动覆盖 node content，只能生成 pending change。
- `apply_pending_change` 只应用当前仍存在且 target node 匹配的 pending change。
- `confirm_tool_plan` V1 仅生成确认请求/说明，不执行未定义批量计划。

### 4.5 Agent Runner Loop

**方向**：CanvasAssistantPanel -> Agent Runner -> Adapter/Tool Registry -> CanvasAssistantPanel
**形式**：异步函数 + event callback

**契约**：

```ts
export type CanvasAgentTimelineEvent = {
  id: string
  type: 'model' | 'tool' | 'permission' | 'error' | 'final'
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
  title: string
  detail?: string
  toolName?: string
  nodeId?: string
  createdAt: string
}

export type RunCanvasAgentInput = {
  userMessage: string
  project: CanvasProject
  history: CanvasAssistantMessage[]
  maxToolCalls?: number // default 8
  signal?: AbortSignal
  onTimelineEvent?: (event: CanvasAgentTimelineEvent) => void
}

export type RunCanvasAgentResult = {
  assistantMessage: string
  timeline: CanvasAgentTimelineEvent[]
  pendingChanges: CanvasAgentPendingChange[]
  usedFallback: boolean
}
```

**约束**：

- 默认 `maxToolCalls = 8`。
- 未配置 Agent Provider 或 adapter 不支持 `runCanvasAgentTurn` 时，UI 可走 legacy fallback。
- 未知工具、非法参数、工具执行失败必须作为 tool result 反馈给模型，不能静默吞掉。
- 预算耗尽时返回明确中文说明，并停止继续调用工具。

### 4.6 UI Focus/Highlight

**方向**：Tool Registry/Assistant UI -> CanvasViewport -> CanvasNodeLayer
**形式**：React imperative handle + props

**契约**：

```ts
export type CanvasViewportHandle = {
  focusNode: (nodeId: string, options?: { highlight?: boolean }) => void
}
```

**约束**：

- `focus_node`、mention hover/select、tool result `focusNodeId` 都必须定位并高亮目标节点。
- 高亮为短时视觉状态，不改变持久化 Canvas project。

## 5. 子 feature 清单

1. **canvas-agent-provider-settings** — 为 Provider settings 增加 agent usage、agent 默认选择和 UI 配置入口。
   - 所属模块：Provider/Profile
   - 依赖：无
   - 状态：done
   - 对应 feature：canvas-agent-v1
   - 备注：先解决 Agent Provider 和 Prompt Provider 分离。

2. **canvas-agent-adapter-contract** — 定义 Canvas Agent tool calling 类型，并在 OpenAI-compatible adapter 实现 Responses API tool call 请求/解析。
   - 所属模块：Adapter Contract
   - 依赖：`canvas-agent-provider-settings`
   - 状态：done
   - 对应 feature：canvas-agent-v1

3. **canvas-agent-state-summary** — 实现 Canvas summary、inspect node、inspect generation context 的纯函数服务。
   - 所属模块：Canvas Context
   - 依赖：无
   - 状态：done
   - 对应 feature：canvas-agent-v1

4. **canvas-agent-tool-registry** — 实现 V1 工具声明、参数校验、权限等级与 Canvas executor 适配。
   - 所属模块：Tool Registry
   - 依赖：`canvas-agent-state-summary`
   - 状态：done
   - 对应 feature：canvas-agent-v1

5. **canvas-agent-runner** — 实现有限 tool loop、错误恢复、timeline 事件和 provider 调用。
   - 所属模块：Agent Runner
   - 依赖：`canvas-agent-adapter-contract`, `canvas-agent-tool-registry`
   - 状态：done
   - 对应 feature：canvas-agent-v1
   - 备注：最小闭环条目。

6. **canvas-agent-pending-changes** — 实现提示词候选变更、确认应用、取消和 UI 操作。
   - 所属模块：Pending Changes
   - 依赖：`canvas-agent-tool-registry`, `canvas-agent-runner`
   - 状态：done
   - 对应 feature：canvas-agent-v1

7. **canvas-agent-assistant-ui** — Canvas Assistant Panel 接入 Agent Runner，展示 Run Timeline、pending change，并把 tool focus/highlight 接入 viewport。
   - 所属模块：Assistant UI
   - 依赖：`canvas-agent-runner`, `canvas-agent-pending-changes`
   - 状态：done
   - 对应 feature：canvas-agent-v1

8. **canvas-agent-legacy-fallback** — 保留并收敛旧 regex 执行路径，未配置 Agent Provider 时自动 fallback 且 UI 明确标识。
   - 所属模块：Assistant UI
   - 依赖：`canvas-agent-assistant-ui`
   - 状态：done
   - 对应 feature：canvas-agent-v1

9. **canvas-agent-v1-acceptance-hardening** — 全链路测试、类型检查、必要文档回写和回归修复。
   - 所属模块：Acceptance Hardening
   - 依赖：`canvas-agent-legacy-fallback`
   - 状态：done
   - 对应 feature：canvas-agent-v1

**最小闭环**：第 5 条 `canvas-agent-runner` 做完后，用户可以配置 Agent Provider，让模型读取 Canvas 状态、focus/inspect/create/connect/run 一个最窄工具链，并在 UI 看到 timeline。

## 6. 排期思路

先做 Provider/adapter/context/tool registry，保证 Agent 能以原生 tool calling 运行；再做 runner 最小闭环；最后把 UI、pending change 和 legacy fallback 接上。这样避免先改 UI 但底层仍是正则解析，也避免 Provider 语义混入 Prompt Provider。

## 7. 观察项

- `architecture/ARCHITECTURE.md` 当前仍描述 Canvas Assistant 为本地规则解析；V1 完成验收后需要由 acceptance 回写现状。
- `requirements/canvas-assistant.md` 当前能力边界偏旧；V1 完成后需要更新为 Canvas Agent/legacy fallback 的现状。

## 8. 变更日志（update 模式）

- 2026-06-07：创建 Canvas Agent V1 roadmap。
- 2026-06-07：Canvas Agent V1 全部子项完成，Provider/adapter/context/tools/runner/UI/pending change/legacy fallback/验收加固均已落地并通过 `pnpm check`。
