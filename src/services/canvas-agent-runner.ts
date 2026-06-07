import type { CanvasAgentChatMessage, CanvasAgentToolCall, CanvasAgentTurnRequest, CanvasAgentTurnResponse } from '../adapters/types'
import { createCanvasAgentToolRegistry, type CanvasAgentPendingChange, type CanvasAgentToolContext, type CanvasAgentToolResult } from './canvas-agent-tools'
import { summarizeCanvasForAgent } from './canvas-agent-context'
import type { CanvasAssistantMessage, CanvasProject } from '../shared/types'

export const DEFAULT_CANVAS_AGENT_MAX_TOOL_CALLS = 8

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
  toolContext: CanvasAgentToolContext
  callModel: (request: CanvasAgentTurnRequest) => Promise<CanvasAgentTurnResponse>
  maxToolCalls?: number
  signal?: AbortSignal
  onTimelineEvent?: (event: CanvasAgentTimelineEvent) => void
}

export type RunCanvasAgentResult = {
  assistantMessage: string
  timeline: CanvasAgentTimelineEvent[]
  pendingChanges: CanvasAgentPendingChange[]
  usedFallback: boolean
}

export async function runCanvasAgent(input: RunCanvasAgentInput): Promise<RunCanvasAgentResult> {
  const maxToolCalls = normalizeMaxToolCalls(input.maxToolCalls)
  const timeline: CanvasAgentTimelineEvent[] = []
  const pendingChanges = new Map<string, CanvasAgentPendingChange>()
  const emit = (event: Omit<CanvasAgentTimelineEvent, 'id' | 'createdAt'>) => {
    const nextEvent: CanvasAgentTimelineEvent = {
      id: `canvas-agent-event-${timeline.length + 1}`,
      createdAt: new Date().toISOString(),
      ...event
    }
    timeline.push(nextEvent)
    input.onTimelineEvent?.(nextEvent)
    return nextEvent
  }
  const replaceTimelineEvent = (id: string, patch: Partial<CanvasAgentTimelineEvent>) => {
    const index = timeline.findIndex((event) => event.id === id)
    if (index < 0) return
    const nextEvent = { ...timeline[index], ...patch }
    timeline[index] = nextEvent
    input.onTimelineEvent?.(nextEvent)
  }
  const toolContext: CanvasAgentToolContext = {
    ...input.toolContext,
    setPendingChange(change) {
      pendingChanges.set(change.id, change)
      input.toolContext.setPendingChange(change)
    },
    clearPendingChange(id) {
      pendingChanges.delete(id)
      input.toolContext.clearPendingChange(id)
    }
  }
  const registry = createCanvasAgentToolRegistry(toolContext)
  const messages = buildInitialMessages(input.project, input.history, input.userMessage)
  let toolCallCount = 0
  let lastAssistantContent = ''

  while (true) {
    throwIfAborted(input.signal)
    const modelEvent = emit({
      type: 'model',
      status: 'running',
      title: '模型思考',
      detail: toolCallCount > 0 ? `已执行 ${toolCallCount}/${maxToolCalls} 个工具。` : '正在分析当前画布和用户意图。'
    })
    let response: CanvasAgentTurnResponse
    try {
      response = await input.callModel({
        messages: messages.map(cloneMessage),
        tools: registry.definitions,
        signal: input.signal
      })
      replaceTimelineEvent(modelEvent.id, {
        status: 'succeeded',
        detail: response.toolCalls.length > 0 ? `模型请求 ${response.toolCalls.length} 个工具。` : '模型已给出最终回复。'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Canvas Agent 模型调用失败。'
      replaceTimelineEvent(modelEvent.id, { status: 'failed', detail: message })
      emit({ type: 'error', status: 'failed', title: '模型调用失败', detail: message })
      return finishResult(message, timeline, pendingChanges)
    }

    if (response.content.trim()) lastAssistantContent = response.content.trim()
    messages.push(toAssistantMessage(response.content, response.toolCalls))
    if (response.toolCalls.length === 0) {
      const finalMessage = lastAssistantContent || '已完成。'
      emit({ type: 'final', status: 'succeeded', title: '运行完成', detail: finalMessage })
      return finishResult(finalMessage, timeline, pendingChanges)
    }

    for (const toolCall of response.toolCalls) {
      if (toolCallCount >= maxToolCalls) {
        const message = `Canvas Agent 工具调用次数已达到上限 ${maxToolCalls}，已停止继续执行。`
        emit({ type: 'final', status: 'failed', title: '工具预算耗尽', detail: message })
        return finishResult(lastAssistantContent ? `${lastAssistantContent}\n\n${message}` : message, timeline, pendingChanges)
      }
      toolCallCount += 1
      const result = await executeToolCall(registry, toolCall, emit, replaceTimelineEvent)
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: stringifyToolResult(result)
      })
    }
  }
}

async function executeToolCall(
  registry: ReturnType<typeof createCanvasAgentToolRegistry>,
  toolCall: CanvasAgentToolCall,
  emit: (event: Omit<CanvasAgentTimelineEvent, 'id' | 'createdAt'>) => CanvasAgentTimelineEvent,
  replaceTimelineEvent: (id: string, patch: Partial<CanvasAgentTimelineEvent>) => void
): Promise<CanvasAgentToolResult> {
  const event = emit({
    type: 'tool',
    status: 'running',
    title: toolTitle(toolCall.name),
    detail: summarizeToolArguments(toolCall.arguments),
    toolName: toolCall.name
  })
  const result = await registry.execute(toolCall.name, toolCall.arguments || {})
  replaceTimelineEvent(event.id, {
    status: result.ok ? 'succeeded' : 'failed',
    detail: result.message,
    ...(result.focusNodeId ? { nodeId: result.focusNodeId } : {})
  })
  return result
}

function buildInitialMessages(project: CanvasProject, history: CanvasAssistantMessage[], userMessage: string): CanvasAgentChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 PixAI Canvas Agent。你的任务是通过提供的 Canvas 工具理解和操作当前画布。',
        '优先使用工具读取真实状态，不要猜测节点 ID；涉及已有节点时先 list_canvas_state 或 inspect_node。',
        '可以自动执行低风险创建、连接、定位和运行生成节点操作。',
        '提示词丰富必须使用 propose_prompt_enrichment，只创建 pending change，不要直接覆盖文本节点。',
        '不要调用未提供的工具。遇到工具错误时，解释原因并给出下一步。',
        `单次运行最多允许 ${DEFAULT_CANVAS_AGENT_MAX_TOOL_CALLS} 次工具调用。`,
        '',
        '当前 Canvas 摘要：',
        JSON.stringify(summarizeCanvasForAgent(project), null, 2)
      ].join('\n')
    },
    ...historyToMessages(history),
    { role: 'user', content: userMessage }
  ]
}

function historyToMessages(history: CanvasAssistantMessage[]): CanvasAgentChatMessage[] {
  return history
    .filter((message) => message.id !== 'canvas-assistant-welcome' && message.content.trim())
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000)
    }))
}

function toAssistantMessage(content: string, toolCalls: CanvasAgentToolCall[]): CanvasAgentChatMessage {
  return {
    role: 'assistant',
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
  }
}

function cloneMessage(message: CanvasAgentChatMessage): CanvasAgentChatMessage {
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content,
      ...(message.tool_calls ? {
        tool_calls: message.tool_calls.map((toolCall) => ({
          ...toolCall,
          arguments: { ...toolCall.arguments }
        }))
      } : {})
    }
  }
  return { ...message }
}

function finishResult(
  assistantMessage: string,
  timeline: CanvasAgentTimelineEvent[],
  pendingChanges: Map<string, CanvasAgentPendingChange>
): RunCanvasAgentResult {
  return {
    assistantMessage,
    timeline: [...timeline],
    pendingChanges: [...pendingChanges.values()],
    usedFallback: false
  }
}

function stringifyToolResult(result: CanvasAgentToolResult): string {
  return JSON.stringify(compactUnknown(result), null, 2)
}

function compactUnknown(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}...[${value.length} chars]` : value
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => compactUnknown(item, depth + 1))
  if (depth >= 5) return '[object]'
  return Object.fromEntries(
    Object.entries(value).slice(0, 100).map(([key, nested]) => [key, compactUnknown(nested, depth + 1)])
  )
}

function normalizeMaxToolCalls(value: unknown): number {
  return Number.isInteger(value) && Number(value) > 0
    ? Math.min(20, Number(value))
    : DEFAULT_CANVAS_AGENT_MAX_TOOL_CALLS
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Canvas Agent 已取消。', 'AbortError')
}

function summarizeToolArguments(args: Record<string, unknown>): string {
  const text = JSON.stringify(args)
  return text.length > 240 ? `${text.slice(0, 240)}...` : text
}

function toolTitle(toolName: string): string {
  if (toolName === 'list_canvas_state') return '读取画布状态'
  if (toolName === 'inspect_node') return '检查节点'
  if (toolName === 'inspect_generation_context') return '检查生成上下文'
  if (toolName === 'focus_node') return '定位节点'
  if (toolName === 'create_text_node') return '创建文本节点'
  if (toolName === 'create_generate_node') return '创建生成节点'
  if (toolName === 'create_text_to_generate_chain') return '创建生成链路'
  if (toolName === 'connect_nodes') return '连接节点'
  if (toolName === 'generate_from_text_node') return '从文本生成'
  if (toolName === 'run_generate_node') return '运行生成节点'
  if (toolName === 'propose_prompt_enrichment') return '生成提示词候选'
  if (toolName === 'apply_pending_change') return '应用待确认变更'
  if (toolName === 'confirm_tool_plan') return '请求确认'
  if (toolName === 'cancel_pending_change') return '取消待确认变更'
  return `执行工具 ${toolName}`
}
