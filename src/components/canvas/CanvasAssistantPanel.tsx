import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Check, ChevronUp, CornerDownLeft, Loader2, Sparkles, Trash2, User, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { pixaiApi } from '../../services/app-api'
import { runCanvasAgent, type CanvasAgentTimelineEvent } from '../../services/canvas-agent-runner'
import { CanvasAgentUnavailableError } from '../../services/canvas-agent-service'
import type { CanvasAgentPendingChange } from '../../services/canvas-agent-tools'
import { createCanvasAssistantMessage } from '../../services/canvas-assistant-messages'
import { canvasConnectionKindForNodes, wouldCreateCanvasConnectionCycle } from '../../services/canvas-projects'
import { parseCanvasAssistantCommand, type CanvasAssistantAction, type CanvasAssistantNodeRef } from '../../services/canvas-assistant'
import type { CanvasAssistantMessage, CanvasConnection, CanvasConnectionKind, CanvasNodeData, CanvasNodeMetadata, CanvasNodeType, CanvasProject } from '../../shared/types'

type CanvasAssistantPanelProps = {
  project: CanvasProject | null
  nodes: CanvasNodeData[]
  connections: CanvasConnection[]
  messages?: CanvasAssistantMessage[]
  hasMoreMessages?: boolean
  loadingMessages?: boolean
  disabled?: boolean
  agentAvailable?: boolean
  getProject?: () => CanvasProject | null
  onCreateNode: (input: { type: CanvasNodeType; content?: string; title?: string; metadata?: Partial<CanvasNodeMetadata> }) => Promise<CanvasNodeData | null>
  onCreateGenerateNodeFromText: (nodeId: string) => Promise<string | null>
  onAddConnection: (fromNodeId: string, toNodeId: string) => Promise<void> | void
  onUpdateNodeContent: (nodeId: string, content: string) => Promise<void> | void
  onEnrichTextNode: (nodeId: string) => Promise<void> | void
  onTextNodeGenerate: (nodeId: string) => Promise<void> | void
  onGenerateNodeRun: (nodeId: string) => Promise<void> | void
  onRunWorkflow: () => Promise<void> | void
  onAppendMessages?: (messages: CanvasAssistantMessage[]) => Promise<void> | void
  onClearMessages?: () => Promise<void> | void
  onLoadMoreMessages?: () => Promise<void> | void
  onFocusNode?: (nodeId: string, options?: { highlight?: boolean }) => void
  onNotify?: (message: string) => void
}

const EXAMPLES = [
  '创建文本节点：赛博城市夜景，然后生成',
  '创建文本节点：电影感猫咪肖像，然后生成并运行',
  '修改最新文本为：柔和棚拍猫咪',
  '连接第1个文本到第1个生成',
  '运行最新生成'
]

const WELCOME_MESSAGE: CanvasAssistantMessage = {
  id: 'canvas-assistant-welcome',
  role: 'assistant',
  content: '我可以帮你创建节点、连接节点、修改提示词，并运行生成。'
}

export function CanvasAssistantPanel({
  project,
  nodes,
  connections,
  messages: persistedMessages,
  hasMoreMessages = false,
  loadingMessages = false,
  disabled = false,
  agentAvailable = false,
  getProject,
  onCreateNode,
  onCreateGenerateNodeFromText,
  onAddConnection,
  onUpdateNodeContent,
  onEnrichTextNode,
  onTextNodeGenerate,
  onGenerateNodeRun,
  onRunWorkflow,
  onAppendMessages,
  onClearMessages,
  onLoadMoreMessages,
  onFocusNode,
  onNotify
}: CanvasAssistantPanelProps) {
  const [draft, setDraft] = useState('')
  const [caretIndex, setCaretIndex] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [suppressedMentionKey, setSuppressedMentionKey] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [timeline, setTimeline] = useState<CanvasAgentTimelineEvent[]>([])
  const [pendingChanges, setPendingChanges] = useState<CanvasAgentPendingChange[]>([])
  const [pendingChangeActionId, setPendingChangeActionId] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const messages = useMemo(() => (
    persistedMessages && persistedMessages.length > 0 ? persistedMessages : [WELCOME_MESSAGE]
  ), [persistedMessages])
  const activeMention = useMemo(() => findActiveMention(draft, caretIndex), [caretIndex, draft])
  const activeMentionKey = activeMention ? `${activeMention.start}:${activeMention.query}` : ''
  const mentionCandidates = useMemo(() => {
    if (!activeMention) return []
    return filterMentionCandidates(nodes, activeMention.query)
  }, [activeMention, nodes])
  const mentionOpen = Boolean(activeMention && !disabled && !running && activeMentionKey !== suppressedMentionKey)

  useEffect(() => {
    setMentionIndex(0)
  }, [activeMentionKey, mentionCandidates.length])

  useEffect(() => {
    if (!mentionOpen) return
    const selectedNode = mentionCandidates[mentionIndex]
    if (selectedNode) onFocusNode?.(selectedNode.id, { highlight: true })
  }, [mentionIndex, mentionCandidates, mentionOpen, onFocusNode])

  const appendMessages = async (nextMessages: CanvasAssistantMessage[]) => {
    await onAppendMessages?.(nextMessages)
  }

  const runLegacyCommand = async (executionCommand: string) => {
    const result = await executeCanvasAssistantCommand(executionCommand, {
      nodes,
      connections,
      onCreateNode,
      onAddConnection,
      onUpdateNodeContent,
      onEnrichTextNode,
      onTextNodeGenerate,
      onGenerateNodeRun,
      onRunWorkflow
    })
    return result
  }

  const runAgentCommand = async (executionCommand: string) => {
    const currentProject = getProject?.() || project
    if (!agentAvailable || !currentProject) {
      return runLegacyCommand(executionCommand)
    }

    const workingProjectRef = { current: cloneCanvasProject(currentProject) }
    const pendingById = new Map(pendingChanges.map((change) => [change.id, change]))
    const refreshWorkingProject = () => {
      const latestProject = getProject?.()
      if (latestProject) workingProjectRef.current = cloneCanvasProject(latestProject)
    }

    try {
      const result = await runCanvasAgent({
        userMessage: executionCommand,
        project: workingProjectRef.current,
        history: persistedMessages || [],
        callModel: (request) => pixaiApi.canvasAgent.runTurn(request),
        onTimelineEvent: (event) => setTimeline((current) => upsertTimelineEvent(current, event)),
        toolContext: {
          getProject: () => workingProjectRef.current,
          createNode: async (input) => {
            const node = await onCreateNode(input)
            refreshWorkingProject()
            if (node && !workingProjectRef.current.nodes.some((item) => item.id === node.id)) {
              workingProjectRef.current = {
                ...workingProjectRef.current,
                nodes: [...workingProjectRef.current.nodes, node]
              }
            }
            return node
          },
          updateNodeContent: async (nodeId, content) => {
            await onUpdateNodeContent(nodeId, content)
            refreshWorkingProject()
            workingProjectRef.current = {
              ...workingProjectRef.current,
              nodes: workingProjectRef.current.nodes.map((node) => (
                node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node
              ))
            }
          },
          addConnection: async (fromNodeId, toNodeId) => {
            await onAddConnection(fromNodeId, toNodeId)
            refreshWorkingProject()
            const fromNode = workingProjectRef.current.nodes.find((node) => node.id === fromNodeId)
            const toNode = workingProjectRef.current.nodes.find((node) => node.id === toNodeId)
            const kind = fromNode && toNode ? canvasConnectionKindForNodes(fromNode, toNode) : null
            const exists = workingProjectRef.current.connections.some(
              (connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId
            )
            if (kind && !exists) {
              workingProjectRef.current = {
                ...workingProjectRef.current,
                connections: [
                  ...workingProjectRef.current.connections,
                  { id: `agent-${fromNodeId}-${toNodeId}`, fromNodeId, toNodeId, kind }
                ]
              }
            }
          },
          createGenerateNodeFromText: async (nodeId) => {
            const generateNodeId = await onCreateGenerateNodeFromText(nodeId)
            refreshWorkingProject()
            return generateNodeId
          },
          generateCanvasNode: async (nodeId) => {
            await onGenerateNodeRun(nodeId)
            refreshWorkingProject()
          },
          enrichTextPrompt: async ({ nodeId }) => {
            const targetProject = workingProjectRef.current
            const node = targetProject.nodes.find((item) => item.id === nodeId && item.type === 'text')
            const prompt = node?.metadata.content.trim() || ''
            if (!node || !prompt) throw new Error('没有可丰富的文本节点内容。')
            return pixaiApi.prompt.enrich({
              prompt,
              hasReferenceImages: targetProject.nodes.some((item) => item.type === 'image' || (item.type === 'result' && Boolean(item.metadata.content)))
            })
          },
          focusNode: (nodeId, options) => onFocusNode?.(nodeId, options),
          setPendingChange: (change) => {
            pendingById.set(change.id, change)
            setPendingChanges([...pendingById.values()])
          },
          getPendingChange: (id) => pendingById.get(id) || null,
          clearPendingChange: (id) => {
            pendingById.delete(id)
            setPendingChanges([...pendingById.values()])
          }
        }
      })
      setPendingChanges([...pendingById.values()])
      return result.assistantMessage
    } catch (error) {
      if (isCanvasAgentUnavailable(error)) {
        return runLegacyCommand(executionCommand)
      }
      throw error
    }
  }

  const applyPendingChange = async (change: CanvasAgentPendingChange) => {
    if (disabled || pendingChangeActionId) return
    setPendingChangeActionId(change.id)
    try {
      await onUpdateNodeContent(change.targetNodeId, change.proposedContent)
      setPendingChanges((current) => current.filter((item) => item.id !== change.id))
      onFocusNode?.(change.targetNodeId, { highlight: true })
      onNotify?.(`已应用候选变更到 ${change.targetNodeTitle || '目标节点'}`)
    } catch (error) {
      onNotify?.(error instanceof Error ? error.message : '应用候选变更失败')
    } finally {
      setPendingChangeActionId(null)
    }
  }

  const cancelPendingChange = (change: CanvasAgentPendingChange) => {
    if (disabled || pendingChangeActionId) return
    setPendingChanges((current) => current.filter((item) => item.id !== change.id))
    onNotify?.('已取消候选变更')
  }

  const clearMessages = async () => {
    if (disabled || running || loadingMessages || !persistedMessages?.length) return
    const confirmed = typeof window === 'undefined' || window.confirm('清空当前画布助手聊天记录？')
    if (!confirmed) return
    await onClearMessages?.()
    onNotify?.('画布助手聊天记录已清空')
  }

  const submit = async (value?: string) => {
    const editor = value === undefined ? editorRef.current : null
    const displayCommand = (editor ? editorPlainText(editor) : value ?? draft).trim()
    const executionCommand = (editor ? editorCommandText(editor) : value ?? draft).trim()
    if (!displayCommand || !executionCommand || disabled || running) return
    setDraft('')
    setCaretIndex(0)
    setSuppressedMentionKey(null)
    if (editorRef.current) editorRef.current.textContent = ''
    setRunning(true)
    setTimeline([])
    const userMessage = createCanvasAssistantMessage('user', displayCommand)
    try {
      await appendMessages([userMessage])
      const result = await runAgentCommand(executionCommand)
      await appendMessages([createCanvasAssistantMessage('assistant', result)])
      onNotify?.(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '画布助手执行失败'
      await appendMessages([createCanvasAssistantMessage('assistant', message)])
      onNotify?.(message)
    } finally {
      setRunning(false)
    }
  }

  const updateDraftFromEditor = (element: HTMLDivElement) => {
    setDraft(editorPlainText(element))
    setCaretIndex(caretTextIndex(element))
    setSuppressedMentionKey(null)
  }

  const syncCaretFromEditor = (element: HTMLDivElement) => {
    setCaretIndex(caretTextIndex(element))
    setSuppressedMentionKey(null)
  }

  const insertMentionCandidate = (node: CanvasNodeData) => {
    const editor = editorRef.current
    if (!activeMention || !editor) return
    onFocusNode?.(node.id, { highlight: true })
    const mentionName = mentionDisplayNameForNode(node, nodes)
    const token = createMentionToken(mentionName, nodeLabel(node), node.id)
    const range = rangeForTextIndexes(editor, activeMention.start, caretIndex)
    const space = document.createTextNode(' ')
    range.deleteContents()
    range.insertNode(token)
    range.setStartAfter(token)
    range.collapse(true)
    range.insertNode(space)
    setCaretAfterNode(space)
    const nextDraft = editorPlainText(editor)
    const nextCaretIndex = activeMention.start + `@${mentionName} `.length
    setDraft(nextDraft)
    setCaretIndex(nextCaretIndex)
    setSuppressedMentionKey(null)
    editor.focus()
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
        <div className="flex shrink-0 items-center gap-1">
          <Button
            className="size-8 p-0"
            type="button"
            variant="ghost"
            disabled={disabled || running || loadingMessages || !persistedMessages?.length}
            title="清空聊天记录"
            aria-label="清空聊天记录"
            onClick={() => void clearMessages()}
          >
            <Trash2 size={15} />
          </Button>
          <Badge variant="outline" className="shrink-0">{agentAvailable ? 'Agent' : '本地'}</Badge>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <div className="grid gap-3 pb-2">
          {hasMoreMessages ? (
            <Button
              className="h-8 w-full text-xs"
              type="button"
              variant="outline"
              disabled={loadingMessages}
              onClick={() => void onLoadMoreMessages?.()}
            >
              {loadingMessages ? <Loader2 className="animate-spin" /> : <ChevronUp />}
              加载更早消息
            </Button>
          ) : null}
          {messages.map((message) => (
            <AssistantMessageBubble key={message.id} message={message} />
          ))}
          {timeline.length > 0 ? (
            <CanvasAgentTimeline
              events={timeline}
              onFocus={(nodeId) => onFocusNode?.(nodeId, { highlight: true })}
            />
          ) : null}
          {pendingChanges.length > 0 ? (
            <CanvasAgentPendingChanges
              changes={pendingChanges}
              busyChangeId={pendingChangeActionId}
              disabled={disabled}
              onApply={(change) => void applyPendingChange(change)}
              onCancel={cancelPendingChange}
              onFocus={(nodeId) => onFocusNode?.(nodeId, { highlight: true })}
            />
          ) : null}
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
          <div className="relative">
            {mentionOpen ? (
              <NodeMentionMenu
                nodes={nodes}
                candidates={mentionCandidates}
                selectedIndex={mentionIndex}
                onSelect={insertMentionCandidate}
                onHighlight={(node, index) => {
                  setMentionIndex(index)
                  onFocusNode?.(node.id, { highlight: true })
                }}
              />
            ) : null}
            {!draft ? (
              <div className="pointer-events-none absolute left-2.5 top-2 z-10 text-sm text-muted-foreground">
                输入：创建文本节点：赛博城市，然后生成并运行
              </div>
            ) : null}
            <div
              ref={editorRef}
              className={cn(
                'max-h-32 min-h-20 w-full overflow-y-auto rounded-lg border border-input bg-background px-2.5 py-2 text-sm leading-6 outline-none whitespace-pre-wrap break-words transition-colors empty:before:content-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                disabled || running ? 'cursor-not-allowed bg-input/50 opacity-50' : ''
              )}
              contentEditable={!disabled && !running}
              data-canvas-assistant-editor="true"
              data-placeholder="输入：创建文本节点：赛博城市，然后生成并运行"
              role="textbox"
              aria-multiline="true"
              aria-disabled={disabled || running}
              aria-autocomplete="list"
              aria-expanded={mentionOpen}
              suppressContentEditableWarning
              onInput={(event) => updateDraftFromEditor(event.currentTarget)}
              onClick={(event) => syncCaretFromEditor(event.currentTarget)}
              onKeyUp={(event) => syncCaretFromEditor(event.currentTarget)}
              onPaste={(event) => {
                event.preventDefault()
                insertPlainTextAtSelection(editorRef.current, event.clipboardData.getData('text/plain'))
                if (editorRef.current) updateDraftFromEditor(editorRef.current)
              }}
              onBlur={() => {
                window.setTimeout(() => setSuppressedMentionKey(activeMentionKey || null), 0)
              }}
              onKeyDown={(event) => {
                const editor = editorRef.current
                if (mentionOpen) {
                  if (event.key === 'ArrowDown' && mentionCandidates.length > 0) {
                    event.preventDefault()
                    setMentionIndex((index) => (index + 1) % mentionCandidates.length)
                    return
                  }
                  if (event.key === 'ArrowUp' && mentionCandidates.length > 0) {
                    event.preventDefault()
                    setMentionIndex((index) => (index - 1 + mentionCandidates.length) % mentionCandidates.length)
                    return
                  }
                  if ((event.key === 'Enter' || event.key === 'Tab') && mentionCandidates[mentionIndex]) {
                    event.preventDefault()
                    insertMentionCandidate(mentionCandidates[mentionIndex])
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setSuppressedMentionKey(activeMentionKey || null)
                    return
                  }
                }
                if (editor && (event.key === 'Backspace' || event.key === 'Delete')) {
                  const removed = removeAdjacentMentionToken(editor, event.key === 'Backspace' ? 'backward' : 'forward')
                  if (removed) {
                    event.preventDefault()
                    updateDraftFromEditor(editor)
                    return
                  }
                }
                if (editor && event.key === 'Enter' && event.shiftKey) {
                  event.preventDefault()
                  insertPlainTextAtSelection(editor, '\n')
                  updateDraftFromEditor(editor)
                  return
                }
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                void submit()
              }}
            />
          </div>
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

function CanvasAgentTimeline({
  events,
  onFocus
}: {
  events: CanvasAgentTimelineEvent[]
  onFocus: (nodeId: string) => void
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-background/75 p-2" data-canvas-agent-timeline="true">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Agent 运行过程</span>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{events.length}</Badge>
      </div>
      <div className="grid gap-1.5">
        {events.slice(-8).map((event) => (
          <button
            key={event.id}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted"
            type="button"
            disabled={!event.nodeId}
            title={event.detail || event.title}
            data-canvas-agent-timeline-event="true"
            onClick={() => {
              if (event.nodeId) onFocus(event.nodeId)
            }}
          >
            <span className={cn('mt-1 size-2 rounded-full', timelineStatusClass(event.status))} />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate text-[11px] font-medium text-foreground">{event.title}</span>
              {event.detail ? (
                <span className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">{event.detail}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CanvasAgentPendingChanges({
  changes,
  busyChangeId,
  disabled,
  onApply,
  onCancel,
  onFocus
}: {
  changes: CanvasAgentPendingChange[]
  busyChangeId: string | null
  disabled: boolean
  onApply: (change: CanvasAgentPendingChange) => void
  onCancel: (change: CanvasAgentPendingChange) => void
  onFocus: (nodeId: string) => void
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2" data-canvas-agent-pending-changes="true">
      <div className="text-[11px] font-medium text-primary">待确认变更</div>
      {changes.map((change) => {
        const busy = busyChangeId === change.id
        return (
          <div key={change.id} className="grid gap-2 rounded-md border border-border bg-background p-2">
            <button
              className="min-w-0 text-left text-[11px] font-medium text-foreground hover:text-primary"
              type="button"
              onClick={() => onFocus(change.targetNodeId)}
            >
              <span className="block truncate">{change.targetNodeTitle || '目标节点'}</span>
            </button>
            <div className="grid gap-1 text-[10px] leading-4 text-muted-foreground">
              <div className="rounded bg-muted/55 px-2 py-1">
                <span className="font-medium text-foreground">原文：</span>
                {compactPreview(change.originalContent)}
              </div>
              <div className="rounded bg-primary/8 px-2 py-1">
                <span className="font-medium text-foreground">候选：</span>
                {compactPreview(change.proposedContent)}
              </div>
            </div>
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={disabled || busy}
                onClick={() => onCancel(change)}
              >
                <X size={13} />
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled || Boolean(busyChangeId)}
                onClick={() => onApply(change)}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                应用
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NodeMentionMenu({
  nodes,
  candidates,
  selectedIndex,
  onSelect,
  onHighlight
}: {
  nodes: CanvasNodeData[]
  candidates: CanvasNodeData[]
  selectedIndex: number
  onSelect: (node: CanvasNodeData) => void
  onHighlight: (node: CanvasNodeData, index: number) => void
}) {
  return (
    <div
      className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
      data-canvas-assistant-mention-menu="true"
      role="listbox"
      aria-label="选择 Canvas 节点"
    >
      <div className="border-b border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">引用 Canvas 节点</div>
      {candidates.length > 0 ? (
        <div className="max-h-48 overflow-y-auto p-1">
          {candidates.map((node, index) => (
            <button
              key={node.id}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs outline-none transition-colors hover:bg-muted',
                index === selectedIndex ? 'bg-muted text-foreground' : 'text-popover-foreground'
              )}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              data-canvas-assistant-mention-option="true"
              onMouseEnter={() => onHighlight(node, index)}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect(node)
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{mentionDisplayNameForNode(node, nodes)}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {nodeMentionSubtitle(node)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {nodes.length > 0 ? '没有匹配的节点' : '当前画布还没有可引用节点'}
        </div>
      )}
    </div>
  )
}

type CanvasAssistantExecutionContext = {
  nodes: CanvasNodeData[]
  connections: CanvasConnection[]
  onCreateNode: CanvasAssistantPanelProps['onCreateNode']
  onAddConnection: CanvasAssistantPanelProps['onAddConnection']
  onUpdateNodeContent: CanvasAssistantPanelProps['onUpdateNodeContent']
  onEnrichTextNode: CanvasAssistantPanelProps['onEnrichTextNode']
  onTextNodeGenerate: CanvasAssistantPanelProps['onTextNodeGenerate']
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
    const node = await context.onCreateNode({ type: action.nodeType, content: action.content, title: action.title })
    if (!node) throw new Error(`无法创建${nodeTypeLabel(action.nodeType)}。`)
    rememberNode(state, node)
    return `已创建${nodeLabel(node)}。`
  }
  if (action.type === 'create-chain') {
    const textNode = await context.onCreateNode({ type: 'text', content: action.prompt, title: action.textTitle })
    if (!textNode) throw new Error('无法创建文本节点。')
    rememberNode(state, textNode)
    const generateNode = await context.onCreateNode({ type: 'generate', title: action.generateTitle })
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
    return `已连接${nodeLabel(fromNode)}到${nodeLabel(toNode)}。`
  }
  if (action.type === 'set-prompt') {
    const target = resolveNodeRef(action.targetRef, state.nodes)
    if (!target || (target.type !== 'text' && target.type !== 'generate' && target.type !== 'batch')) {
      throw new Error('没有找到可修改提示词的节点。')
    }
    await context.onUpdateNodeContent(target.id, action.content)
    replaceNode(state, { ...target, metadata: { ...target.metadata, content: action.content } })
    return `已修改${nodeLabel(target)}内容。`
  }
  if (action.type === 'enrich-prompt') {
    const target = resolveNodeRef(action.targetRef, state.nodes)
    if (!target || target.type !== 'text') {
      throw new Error('没有找到可丰富提示词的文本节点。')
    }
    await context.onEnrichTextNode(target.id)
    return `已丰富${nodeLabel(target)}内容。`
  }
  if (action.type === 'generate-from-text') {
    const target = resolveNodeRef(action.targetRef, state.nodes)
    if (!target || target.type !== 'text') {
      throw new Error('没有找到可生成图片的文本节点。')
    }
    await context.onTextNodeGenerate(target.id)
    return `已从${nodeLabel(target)}创建生成节点并运行。`
  }
  if (action.type === 'run-node') {
    const target = action.targetRef ? resolveNodeRef(action.targetRef, state.nodes) : state.lastGenerateNode
    const generateNode = target?.type === 'generate' ? target : latestNodeOfType(state.nodes, 'generate')
    if (!generateNode) throw new Error('没有可运行的生成节点。')
    await context.onGenerateNodeRun(generateNode.id)
    return `已运行${nodeLabel(generateNode)}。`
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
  let candidates = ref.nodeType ? nodes.filter((node) => node.type === ref.nodeType) : nodes
  if (ref.id) return candidates.find((node) => node.id === ref.id) || null
  if (ref.name) {
    const normalizedName = normalizeNodeName(ref.name)
    const typeCandidates = candidates
    candidates = candidates.filter((node) => normalizeNodeName(nodeLabel(node)) === normalizedName || normalizeNodeName(node.id) === normalizedName)
    if (candidates.length === 0 && ref.nodeType && ref.ordinal != null) {
      return typeCandidates[ref.ordinal - 1] || null
    }
    if (candidates.length === 0) return null
    if (ref.ordinal != null) return candidates[ref.ordinal - 1] || null
    if (ref.latest) return candidates.at(-1) || null
    if (candidates.length > 1) throw new Error(`找到多个名为 @${ref.name} 的节点，请补充节点类型或第 N 个。`)
    return candidates[0]
  }
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

function nodeLabel(node: CanvasNodeData): string {
  return node.title?.trim() || nodeTypeLabel(node.type)
}

function normalizeNodeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function findActiveMention(value: string, caretIndex: number): { start: number; query: string } | null {
  const beforeCaret = value.slice(0, Math.max(0, Math.min(caretIndex, value.length)))
  const start = beforeCaret.lastIndexOf('@')
  if (start < 0) return null
  const query = beforeCaret.slice(start + 1)
  if (hasMentionStopChars(query)) return null
  return { start, query }
}

function filterMentionCandidates(nodes: CanvasNodeData[], query: string): CanvasNodeData[] {
  const normalizedQuery = normalizeNodeName(query)
  return nodes
    .filter((node) => {
      if (!normalizedQuery) return true
      return normalizeNodeName(`${node.title} ${node.id} ${nodeTypeLabel(node.type)} ${nodeContentPreview(node)}`).includes(normalizedQuery)
    })
    .slice(0, 8)
}

function mentionDisplayNameForNode(node: CanvasNodeData, nodes: CanvasNodeData[]): string {
  const label = nodeLabel(node)
  const sameLabelNodes = nodes.filter((item) => normalizeNodeName(nodeLabel(item)) === normalizeNodeName(label))
  if (sameLabelNodes.length <= 1) return label
  const sameTypeNodes = nodes.filter((item) => item.type === node.type)
  const typeIndex = sameTypeNodes.findIndex((item) => item.id === node.id) + 1
  return `${label} #${Math.max(1, typeIndex)}`
}

function nodeMentionSubtitle(node: CanvasNodeData): string {
  const preview = nodeContentPreview(node)
  return preview ? `${nodeTypeLabel(node.type)} · ${preview}` : nodeTypeLabel(node.type)
}

function nodeContentPreview(node: CanvasNodeData): string {
  const content = typeof node.metadata.content === 'string' ? node.metadata.content.trim().replace(/\s+/g, ' ') : ''
  if (!content || content.startsWith('data:')) return ''
  return content.length > 26 ? `${content.slice(0, 26)}...` : content
}

function cloneCanvasProject(project: CanvasProject): CanvasProject {
  return {
    ...project,
    nodes: project.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      metadata: { ...node.metadata }
    })),
    connections: project.connections.map((connection) => ({ ...connection })),
    viewport: { ...project.viewport }
  }
}

function upsertTimelineEvent(
  current: CanvasAgentTimelineEvent[],
  nextEvent: CanvasAgentTimelineEvent
): CanvasAgentTimelineEvent[] {
  const index = current.findIndex((event) => event.id === nextEvent.id)
  if (index < 0) return [...current, nextEvent]
  return current.map((event) => (event.id === nextEvent.id ? nextEvent : event))
}

function isCanvasAgentUnavailable(error: unknown): boolean {
  return error instanceof CanvasAgentUnavailableError
    || (error instanceof Error && error.name === 'CanvasAgentUnavailableError')
}

function timelineStatusClass(status: CanvasAgentTimelineEvent['status']): string {
  if (status === 'running') return 'bg-primary animate-pulse'
  if (status === 'succeeded') return 'bg-emerald-500'
  if (status === 'failed') return 'bg-destructive'
  if (status === 'skipped') return 'bg-muted-foreground/50'
  return 'bg-muted-foreground/70'
}

function compactPreview(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return '空'
  return text.length > 120 ? `${text.slice(0, 120)}...` : text
}

function hasMentionStopChars(value: string): boolean {
  return /[\s@，,。；;：:、]/u.test(value)
}

function editorPlainText(element: HTMLElement): string {
  return editorText(element, 'display')
}

function editorCommandText(element: HTMLElement): string {
  return editorText(element, 'command')
}

function editorText(root: HTMLElement, mode: 'display' | 'command'): string {
  let text = ''
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
      return
    }
    if (node instanceof HTMLElement && node.dataset.canvasAssistantMentionToken === 'true') {
      const nodeId = node.dataset.canvasAssistantMentionNodeId
      text += mode === 'command' && nodeId ? `@${nodeId}` : node.textContent || ''
      return
    }
    node.childNodes.forEach(visit)
  }
  root.childNodes.forEach(visit)
  return text
}

function caretTextIndex(root: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return editorPlainText(root).length
  const range = selection.getRangeAt(0)
  if (!root.contains(range.endContainer)) return editorPlainText(root).length
  const beforeCaret = range.cloneRange()
  beforeCaret.selectNodeContents(root)
  try {
    beforeCaret.setEnd(range.endContainer, range.endOffset)
  } catch {
    return editorPlainText(root).length
  }
  return beforeCaret.toString().length
}

function rangeForTextIndexes(root: HTMLElement, start: number, end: number): Range {
  const range = document.createRange()
  const startPosition = domPositionForTextIndex(root, start)
  const endPosition = domPositionForTextIndex(root, end)
  range.setStart(startPosition.node, startPosition.offset)
  range.setEnd(endPosition.node, endPosition.offset)
  return range
}

function domPositionForTextIndex(root: HTMLElement, index: number): { node: Node; offset: number } {
  const targetIndex = Math.max(0, index)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = targetIndex
  let lastTextNode: Text | null = null
  while (true) {
    const current = walker.nextNode() as Text | null
    if (!current) break
    lastTextNode = current
    if (remaining <= current.data.length) return { node: current, offset: remaining }
    remaining -= current.data.length
  }
  if (lastTextNode) return { node: lastTextNode, offset: lastTextNode.data.length }
  return { node: root, offset: root.childNodes.length }
}

function createMentionToken(mentionName: string, label: string, nodeId: string): HTMLElement {
  const token = document.createElement('span')
  token.contentEditable = 'false'
  token.setAttribute('contenteditable', 'false')
  token.dataset.canvasAssistantMentionToken = 'true'
  token.dataset.canvasAssistantMentionNodeId = nodeId
  token.dataset.mention = mentionName
  token.title = label
  token.className = 'mx-0.5 inline-flex max-w-full select-none items-center rounded-md bg-primary/10 px-1.5 py-0.5 align-baseline text-xs font-medium text-primary ring-1 ring-primary/20'
  token.textContent = `@${mentionName}`
  return token
}

function setCaretAfterNode(node: Node): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function setCaretByTextIndex(root: HTMLElement, index: number): void {
  const selection = window.getSelection()
  if (!selection) return
  const position = domPositionForTextIndex(root, index)
  const range = document.createRange()
  range.setStart(position.node, position.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function insertPlainTextAtSelection(root: HTMLElement | null, value: string): void {
  if (!root || !value) return
  const selection = window.getSelection()
  const text = document.createTextNode(value.replace(/\r\n?/g, '\n'))
  if (!selection || selection.rangeCount === 0) {
    root.appendChild(text)
    setCaretAfterNode(text)
    return
  }
  const range = selection.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) {
    root.appendChild(text)
    setCaretAfterNode(text)
    return
  }
  range.deleteContents()
  range.insertNode(text)
  setCaretAfterNode(text)
}

type MentionTokenRange = {
  element: HTMLElement
  start: number
  end: number
}

function removeAdjacentMentionToken(root: HTMLElement, direction: 'backward' | 'forward'): boolean {
  const caretIndex = caretTextIndex(root)
  const text = editorPlainText(root)
  const ranges = collectMentionTokenRanges(root)
  const target = ranges.find((range) => {
    const trailingSpaceLength = text[range.end] === ' ' ? 1 : 0
    if (direction === 'backward') return caretIndex > range.start && caretIndex <= range.end + trailingSpaceLength
    return caretIndex >= range.start && caretIndex < range.end + trailingSpaceLength
  })
  if (!target) return false
  const nextSibling = target.element.nextSibling
  target.element.remove()
  if (nextSibling?.nodeType === Node.TEXT_NODE && nextSibling.textContent?.startsWith(' ')) {
    nextSibling.textContent = nextSibling.textContent.slice(1)
    if (!nextSibling.textContent) nextSibling.parentNode?.removeChild(nextSibling)
  }
  setCaretByTextIndex(root, target.start)
  return true
}

function collectMentionTokenRanges(root: HTMLElement): MentionTokenRange[] {
  const ranges: MentionTokenRange[] = []
  let index = 0
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      index += node.textContent?.length || 0
      return
    }
    if (node instanceof HTMLElement && node.dataset.canvasAssistantMentionToken === 'true') {
      const length = node.textContent?.length || 0
      ranges.push({ element: node, start: index, end: index + length })
      index += length
      return
    }
    node.childNodes.forEach(visit)
  }
  root.childNodes.forEach(visit)
  return ranges
}
