import { useState } from 'react'
import { Bot, CornerDownLeft, Sparkles, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { canvasConnectionKindForNodes, wouldCreateCanvasConnectionCycle } from '../../services/canvas-projects'
import { parseCanvasAssistantCommand, type CanvasAssistantAction, type CanvasAssistantNodeRef } from '../../services/canvas-assistant'
import type { CanvasConnection, CanvasConnectionKind, CanvasNodeData, CanvasNodeMetadata, CanvasNodeType } from '../../shared/types'

type CanvasAssistantPanelProps = {
  nodes: CanvasNodeData[]
  connections: CanvasConnection[]
  disabled?: boolean
  onCreateNode: (input: { type: CanvasNodeType; content?: string; metadata?: Partial<CanvasNodeMetadata> }) => Promise<CanvasNodeData | null>
  onAddConnection: (fromNodeId: string, toNodeId: string) => Promise<void> | void
  onUpdateNodeContent: (nodeId: string, content: string) => Promise<void> | void
  onGenerateNodeRun: (nodeId: string) => Promise<void> | void
  onRunWorkflow: () => Promise<void> | void
  onNotify?: (message: string) => void
}

type CanvasAssistantMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
}

const EXAMPLES = [
  '创建文本节点：赛博城市夜景，然后生成',
  '创建文本节点：电影感猫咪肖像，然后生成并运行',
  '修改最新文本为：柔和棚拍猫咪',
  '连接第1个文本到第1个生成',
  '运行最新生成'
]

let messageCounter = 0

export function CanvasAssistantPanel({
  nodes,
  connections,
  disabled = false,
  onCreateNode,
  onAddConnection,
  onUpdateNodeContent,
  onGenerateNodeRun,
  onRunWorkflow,
  onNotify
}: CanvasAssistantPanelProps) {
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)
  const [messages, setMessages] = useState<CanvasAssistantMessage[]>([
    {
      id: createMessageId(),
      role: 'assistant',
      content: '我可以帮你创建节点、连接节点、修改提示词，并运行生成。'
    }
  ])

  const submit = async (value = draft) => {
    const command = value.trim()
    if (!command || disabled || running) return
    setDraft('')
    setMessages((current) => current.concat({ id: createMessageId(), role: 'user', content: command }))
    setRunning(true)
    try {
      const result = await executeCanvasAssistantCommand(command, {
        nodes,
        connections,
        onCreateNode,
        onAddConnection,
        onUpdateNodeContent,
        onGenerateNodeRun,
        onRunWorkflow
      })
      setMessages((current) => current.concat({
        id: createMessageId(),
        role: 'assistant',
        content: result
      }))
      onNotify?.(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '画布助手执行失败'
      setMessages((current) => current.concat({
        id: createMessageId(),
        role: 'assistant',
        content: message
      }))
      onNotify?.(message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <aside className="canvas-assistant-panel relative z-20 flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-card/88 shadow-sm">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Bot size={17} />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <div className="truncate text-sm font-semibold">画布助手</div>
            <div className="truncate text-[11px] text-muted-foreground">对话调度当前 Canvas</div>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">Beta</Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <div className="grid gap-3 pb-2">
          {messages.map((message) => (
            <AssistantMessageBubble key={message.id} message={message} />
          ))}
          {running ? (
            <AssistantMessageBubble
              message={{ id: 'assistant-running', role: 'assistant', content: '正在调度画布操作...' }}
            />
          ) : null}
        </div>
      </ScrollArea>
      <div className="grid shrink-0 gap-3 border-t border-border p-3">
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.slice(0, 3).map((example) => (
            <button
              key={example}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              type="button"
              disabled={disabled || running}
              onClick={() => void submit(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Textarea
            className="max-h-32 min-h-20 resize-none bg-background text-sm"
            value={draft}
            placeholder="输入：创建文本节点：赛博城市，然后生成并运行"
            disabled={disabled || running}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              void submit()
            }}
          />
          <Button type="submit" disabled={disabled || running || !draft.trim()} className="w-full">
            <CornerDownLeft />
            发送给画布助手
          </Button>
        </form>
      </div>
    </aside>
  )
}

function AssistantMessageBubble({ message }: { message: CanvasAssistantMessage }) {
  const assistant = message.role === 'assistant'
  return (
    <div className={assistant ? 'flex items-start gap-2' : 'flex flex-row-reverse items-start gap-2'}>
      <span className={assistant ? 'grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary' : 'grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground'}>
        {assistant ? <Sparkles size={14} /> : <User size={14} />}
      </span>
      <div className={assistant ? 'min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5 text-foreground' : 'min-w-0 rounded-lg bg-primary px-3 py-2 text-xs leading-5 text-primary-foreground'}>
        {message.content}
      </div>
    </div>
  )
}

type CanvasAssistantExecutionContext = {
  nodes: CanvasNodeData[]
  connections: CanvasConnection[]
  onCreateNode: CanvasAssistantPanelProps['onCreateNode']
  onAddConnection: CanvasAssistantPanelProps['onAddConnection']
  onUpdateNodeContent: CanvasAssistantPanelProps['onUpdateNodeContent']
  onGenerateNodeRun: CanvasAssistantPanelProps['onGenerateNodeRun']
  onRunWorkflow: CanvasAssistantPanelProps['onRunWorkflow']
}

async function executeCanvasAssistantCommand(command: string, context: CanvasAssistantExecutionContext): Promise<string> {
  const parsed = parseCanvasAssistantCommand(command)
  if (parsed.actions.length === 0) {
    return [parsed.summary, ...parsed.hints].join('\n')
  }
  const state = createExecutionState(context.nodes, context.connections)
  const notes: string[] = []
  for (const action of parsed.actions) {
    notes.push(await executeAssistantAction(action, context, state))
  }
  return notes.join('\n')
}

type ExecutionState = {
  nodes: CanvasNodeData[]
  connections: CanvasConnection[]
  lastCreatedNode: CanvasNodeData | null
  lastGenerateNode: CanvasNodeData | null
}

function createExecutionState(nodes: CanvasNodeData[], connections: CanvasConnection[]): ExecutionState {
  return {
    nodes: [...nodes],
    connections: [...connections],
    lastCreatedNode: null,
    lastGenerateNode: latestNodeOfType(nodes, 'generate')
  }
}

async function executeAssistantAction(
  action: CanvasAssistantAction,
  context: CanvasAssistantExecutionContext,
  state: ExecutionState
): Promise<string> {
  if (action.type === 'create-node') {
    const node = await context.onCreateNode({ type: action.nodeType, content: action.content })
    if (!node) throw new Error(`无法创建${nodeTypeLabel(action.nodeType)}。`)
    rememberNode(state, node)
    return `已创建${nodeTypeLabel(node.type)}。`
  }
  if (action.type === 'create-chain') {
    const textNode = await context.onCreateNode({ type: 'text', content: action.prompt })
    if (!textNode) throw new Error('无法创建文本节点。')
    rememberNode(state, textNode)
    const generateNode = await context.onCreateNode({ type: 'generate' })
    if (!generateNode) throw new Error('无法创建生成节点。')
    rememberNode(state, generateNode)
    const kind = assertConnectable(state, textNode, generateNode)
    await context.onAddConnection(textNode.id, generateNode.id)
    rememberConnection(state, textNode.id, generateNode.id, kind)
    if (action.run) await context.onGenerateNodeRun(generateNode.id)
    return action.run
      ? `已创建文本节点和生成节点，已连接并运行生成。`
      : `已创建文本节点和生成节点，并建立提示词连接。`
  }
  if (action.type === 'connect') {
    const fromNode = resolveNodeRef(action.fromRef, state.nodes)
    const toNode = resolveNodeRef(action.toRef, state.nodes)
    if (!fromNode || !toNode) throw new Error('没有找到要连接的节点。')
    const kind = assertConnectable(state, fromNode, toNode)
    await context.onAddConnection(fromNode.id, toNode.id)
    rememberConnection(state, fromNode.id, toNode.id, kind)
    return `已连接${nodeTypeLabel(fromNode.type)}到${nodeTypeLabel(toNode.type)}。`
  }
  if (action.type === 'set-prompt') {
    const target = resolveNodeRef(action.targetRef, state.nodes)
    if (!target || (target.type !== 'text' && target.type !== 'generate' && target.type !== 'batch')) {
      throw new Error('没有找到可修改提示词的节点。')
    }
    await context.onUpdateNodeContent(target.id, action.content)
    replaceNode(state, { ...target, metadata: { ...target.metadata, content: action.content } })
    return `已修改${nodeTypeLabel(target.type)}内容。`
  }
  if (action.type === 'run-node') {
    const target = action.targetRef ? resolveNodeRef(action.targetRef, state.nodes) : state.lastGenerateNode
    const generateNode = target?.type === 'generate' ? target : latestNodeOfType(state.nodes, 'generate')
    if (!generateNode) throw new Error('没有可运行的生成节点。')
    await context.onGenerateNodeRun(generateNode.id)
    return '已运行生成节点。'
  }
  await context.onRunWorkflow()
  return '已运行 Canvas workflow。'
}

function rememberNode(state: ExecutionState, node: CanvasNodeData): void {
  state.nodes.push(node)
  state.lastCreatedNode = node
  if (node.type === 'generate') state.lastGenerateNode = node
}

function assertConnectable(state: ExecutionState, fromNode: CanvasNodeData, toNode: CanvasNodeData): CanvasConnectionKind {
  if (fromNode.id === toNode.id) throw new Error('不能连接同一个节点。')
  const kind = canvasConnectionKindForNodes(fromNode, toNode)
  if (!kind) throw new Error('这两个节点不能建立有效连接。')
  const exists = state.connections.some(
    (connection) => connection.fromNodeId === fromNode.id && connection.toNodeId === toNode.id && connection.kind === kind
  )
  if (exists) throw new Error('这条连接已经存在。')
  if (wouldCreateCanvasConnectionCycle(state.connections, fromNode.id, toNode.id)) {
    throw new Error('这条连接会形成环路，已取消。')
  }
  return kind
}

function rememberConnection(state: ExecutionState, fromNodeId: string, toNodeId: string, kind: CanvasConnectionKind): void {
  state.connections.push({ id: `assistant-${fromNodeId}-${toNodeId}`, fromNodeId, toNodeId, kind })
}

function replaceNode(state: ExecutionState, nextNode: CanvasNodeData): void {
  state.nodes = state.nodes.map((node) => (node.id === nextNode.id ? nextNode : node))
  if (state.lastCreatedNode?.id === nextNode.id) state.lastCreatedNode = nextNode
  if (nextNode.type === 'generate') state.lastGenerateNode = nextNode
}

function resolveNodeRef(ref: CanvasAssistantNodeRef, nodes: CanvasNodeData[]): CanvasNodeData | null {
  const candidates = ref.nodeType ? nodes.filter((node) => node.type === ref.nodeType) : nodes
  if (candidates.length === 0) return null
  if (ref.latest) return candidates.at(-1) || null
  if (ref.ordinal != null) return candidates[ref.ordinal - 1] || null
  return candidates.at(-1) || null
}

function latestNodeOfType(nodes: CanvasNodeData[], type: CanvasNodeType): CanvasNodeData | null {
  return nodes.filter((node) => node.type === type).at(-1) || null
}

function nodeTypeLabel(type: CanvasNodeType): string {
  if (type === 'text') return '文本节点'
  if (type === 'generate') return '生成节点'
  if (type === 'config') return '配置节点'
  if (type === 'batch') return '批量节点'
  if (type === 'result') return '结果节点'
  return '图片节点'
}

function createMessageId(): string {
  messageCounter += 1
  return `canvas-assistant-message-${messageCounter}`
}
