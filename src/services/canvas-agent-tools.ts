import { createId } from '../lib/ids'
import { canvasConnectionKindForNodes, wouldCreateCanvasConnectionCycle } from './canvas-projects'
import { inspectCanvasGenerationContext, inspectCanvasNode, nodeAgentLabel, summarizeCanvasForAgent } from './canvas-agent-context'
import type { CanvasAgentToolDefinition } from '../adapters/types'
import type { CanvasNodeData, CanvasNodeMetadata, CanvasNodeType, CanvasProject } from '../shared/types'

export type CanvasAgentPendingChange = {
  id: string
  type: 'replace-node-content'
  targetNodeId: string
  targetNodeTitle: string
  originalContent: string
  proposedContent: string
  createdAt: string
  sourceToolName: string
}

export type CanvasAgentToolPermission = 'auto' | 'confirm'

export type CanvasAgentToolContext = {
  getProject(): CanvasProject | null
  createNode(input: { type: CanvasNodeType; content?: string; title?: string; metadata?: Partial<CanvasNodeMetadata> }): Promise<CanvasNodeData | null>
  updateNodeContent(nodeId: string, content: string): Promise<void>
  addConnection(fromNodeId: string, toNodeId: string): Promise<void>
  createGenerateNodeFromText(nodeId: string): Promise<string | null>
  generateCanvasNode(nodeId: string): Promise<void>
  enrichTextPrompt(input: { nodeId: string }): Promise<string>
  focusNode(nodeId: string, options?: { highlight?: boolean }): void
  setPendingChange(change: CanvasAgentPendingChange): void
  getPendingChange(id: string): CanvasAgentPendingChange | null
  clearPendingChange(id: string): void
  allowConfirmTools?: boolean
}

export type CanvasAgentToolResult = {
  ok: boolean
  message: string
  data?: unknown
  focusNodeId?: string
  pendingChange?: CanvasAgentPendingChange
}

export type CanvasAgentToolSpec = {
  definition: CanvasAgentToolDefinition
  permission: CanvasAgentToolPermission
  execute(args: Record<string, unknown>, context: CanvasAgentToolContext): Promise<CanvasAgentToolResult>
}

export type CanvasAgentToolRegistry = {
  definitions: CanvasAgentToolDefinition[]
  execute(name: string, args: Record<string, unknown>): Promise<CanvasAgentToolResult>
}

export function createCanvasAgentToolRegistry(context: CanvasAgentToolContext): CanvasAgentToolRegistry {
  const tools = new Map(CANVAS_AGENT_TOOLS.map((tool) => [tool.definition.function.name, tool]))
  return {
    definitions: CANVAS_AGENT_TOOLS.map((tool) => tool.definition),
    async execute(name, args) {
      const tool = tools.get(name)
      if (!tool) {
        return {
          ok: false,
          message: `未知 Canvas Agent 工具：${name}`
        }
      }
      if (tool.permission === 'confirm' && !context.allowConfirmTools) {
        return {
          ok: false,
          message: `${name} 需要用户确认，不能由模型自动执行。`,
          data: { requiresConfirmation: true, toolName: name }
        }
      }
      try {
        const result = await tool.execute(args, context)
        if (result.focusNodeId) context.focusNode(result.focusNodeId, { highlight: true })
        return result
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : `${name} 执行失败。`
        }
      }
    }
  }
}

const CANVAS_AGENT_TOOLS: CanvasAgentToolSpec[] = [
  {
    permission: 'auto',
    definition: toolDefinition('list_canvas_state', '返回当前 Canvas 的结构化摘要，包括节点、连接和短内容预览。', {
      type: 'object',
      properties: {},
      additionalProperties: false
    }),
    async execute(_args, context) {
      const project = requireProject(context)
      return {
        ok: true,
        message: `当前画布有 ${project.nodes.length} 个节点和 ${project.connections.length} 条连接。`,
        data: summarizeCanvasForAgent(project)
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('inspect_node', '读取单个节点的详细信息。需要 node_id。', {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Canvas 节点 ID，或当前摘要里的可见节点 label，例如“文本节点 #2”。' }
      },
      required: ['node_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const project = requireProject(context)
      const node = resolveCanvasAgentNode(project, readRequiredString(args, 'node_id', 'nodeId'))
      const nodeId = node.id
      return {
        ok: true,
        message: `已读取节点 ${nodeId}。`,
        data: inspectCanvasNode(project, nodeId),
        focusNodeId: nodeId
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('inspect_generation_context', '读取生成节点的提示词、参考图、参数和批量上下文摘要。需要 node_id。', {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: '生成节点 ID，或当前摘要里的可见节点 label，例如“生成节点 #1”。' }
      },
      required: ['node_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const project = requireProject(context)
      const node = resolveCanvasAgentNode(project, readRequiredString(args, 'node_id', 'nodeId'), 'generate')
      const nodeId = node.id
      const data = inspectCanvasGenerationContext(project, nodeId)
      return {
        ok: data.ok,
        message: data.message,
        data,
        focusNodeId: nodeId
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('focus_node', '定位并高亮一个 Canvas 节点。需要 node_id。', {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Canvas 节点 ID，或当前摘要里的可见节点 label，例如“文本节点 #2”。' }
      },
      required: ['node_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const project = requireProject(context)
      const node = resolveCanvasAgentNode(project, readRequiredString(args, 'node_id', 'nodeId'))
      return {
        ok: true,
        message: `已定位并高亮节点 ${node.id}。`,
        focusNodeId: node.id
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('create_text_node', '创建文本节点。content 会写入节点内容，title 可选。', {
      type: 'object',
      properties: {
        content: { type: 'string', description: '文本节点内容。' },
        title: { type: 'string', description: '节点标题。' }
      },
      required: ['content'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const content = readRequiredString(args, 'content')
      const title = readOptionalString(args, 'title')
      const node = await context.createNode({ type: 'text', content, ...(title ? { title } : {}) })
      if (!node) throw new Error('文本节点创建失败。')
      return {
        ok: true,
        message: `已创建文本节点：${node.title}`,
        data: { node },
        focusNodeId: node.id
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('create_generate_node', '创建生成节点。prompt/title 可选，prompt 会写入生成节点本地内容。', {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '生成节点本地 prompt。' },
        title: { type: 'string', description: '节点标题。' }
      },
      additionalProperties: false
    }),
    async execute(args, context) {
      const prompt = readOptionalString(args, 'prompt')
      const title = readOptionalString(args, 'title')
      const node = await context.createNode({ type: 'generate', content: prompt, ...(title ? { title } : {}) })
      if (!node) throw new Error('生成节点创建失败。')
      return {
        ok: true,
        message: `已创建生成节点：${node.title}`,
        data: { node },
        focusNodeId: node.id
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('create_text_to_generate_chain', '创建文本节点和生成节点，并建立提示词连接。run=true 时立即运行生成。', {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '文本节点提示词内容。' },
        run: { type: 'boolean', description: '是否创建后立即运行生成节点。' },
        text_title: { type: 'string', description: '文本节点标题。' },
        generate_title: { type: 'string', description: '生成节点标题。' }
      },
      required: ['prompt'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const prompt = readRequiredString(args, 'prompt')
      const run = readBoolean(args, 'run')
      const textTitle = readOptionalString(args, 'text_title', 'textTitle')
      const generateTitle = readOptionalString(args, 'generate_title', 'generateTitle')
      const textNode = await context.createNode({ type: 'text', content: prompt, ...(textTitle ? { title: textTitle } : {}) })
      if (!textNode) throw new Error('文本节点创建失败。')
      const generateNode = await context.createNode({ type: 'generate', ...(generateTitle ? { title: generateTitle } : {}) })
      if (!generateNode) throw new Error('生成节点创建失败。')
      await context.addConnection(textNode.id, generateNode.id)
      if (run) await context.generateCanvasNode(generateNode.id)
      return {
        ok: true,
        message: run ? '已创建文本到生成链路，并已运行生成。' : '已创建文本到生成链路。',
        data: { textNode, generateNode, run },
        focusNodeId: generateNode.id
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('connect_nodes', '连接两个已有节点。连接类型由节点类型自动推导。', {
      type: 'object',
      properties: {
        from_node_id: { type: 'string', description: '起点节点 ID，或当前摘要里的可见节点 label。' },
        to_node_id: { type: 'string', description: '终点节点 ID，或当前摘要里的可见节点 label。' }
      },
      required: ['from_node_id', 'to_node_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const project = requireProject(context)
      const fromNode = resolveCanvasAgentNode(project, readRequiredString(args, 'from_node_id', 'fromNodeId'))
      const toNode = resolveCanvasAgentNode(project, readRequiredString(args, 'to_node_id', 'toNodeId'))
      const fromNodeId = fromNode.id
      const toNodeId = toNode.id
      const kind = canvasConnectionKindForNodes(fromNode, toNode)
      if (!kind) throw new Error('这两个节点不能建立有效连接。')
      const exists = project.connections.some((connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId && connection.kind === kind)
      if (exists) return { ok: true, message: '连接已存在。', data: { kind }, focusNodeId: toNodeId }
      if (wouldCreateCanvasConnectionCycle(project.connections, fromNodeId, toNodeId)) throw new Error('这条连接会形成环路，已取消。')
      await context.addConnection(fromNodeId, toNodeId)
      return {
        ok: true,
        message: `已建立${kind}连接。`,
        data: { fromNodeId, toNodeId, kind },
        focusNodeId: toNodeId
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('generate_from_text_node', '从文本节点创建下游生成节点，并立即运行。需要 node_id。', {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: '文本节点 ID，或当前摘要里的可见节点 label，例如“文本节点 #2”。' }
      },
      required: ['node_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const project = requireProject(context)
      const node = resolveCanvasAgentNode(project, readRequiredString(args, 'node_id', 'nodeId'), 'text')
      const nodeId = node.id
      const generateNodeId = await context.createGenerateNodeFromText(nodeId)
      if (!generateNodeId) throw new Error('创建生成节点失败。')
      await context.generateCanvasNode(generateNodeId)
      return {
        ok: true,
        message: '已从文本节点创建生成节点并运行。',
        data: { textNodeId: nodeId, generateNodeId },
        focusNodeId: generateNodeId
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('run_generate_node', '运行一个已有生成节点。需要 node_id。', {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: '生成节点 ID，或当前摘要里的可见节点 label，例如“生成节点 #1”。' }
      },
      required: ['node_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const project = requireProject(context)
      const node = resolveCanvasAgentNode(project, readRequiredString(args, 'node_id', 'nodeId'), 'generate')
      const nodeId = node.id
      await context.generateCanvasNode(nodeId)
      return {
        ok: true,
        message: '已运行生成节点。',
        focusNodeId: nodeId
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('propose_prompt_enrichment', '为文本节点生成丰富后的提示词候选。此工具只创建 pending change，不会直接覆盖节点。', {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: '文本节点 ID，或当前摘要里的可见节点 label，例如“文本节点 #2”。' }
      },
      required: ['node_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const project = requireProject(context)
      const node = resolveCanvasAgentNode(project, readRequiredString(args, 'node_id', 'nodeId'), 'text')
      const nodeId = node.id
      const proposedContent = await context.enrichTextPrompt({ nodeId })
      const change: CanvasAgentPendingChange = {
        id: createId('canvas-agent-change'),
        type: 'replace-node-content',
        targetNodeId: node.id,
        targetNodeTitle: node.title,
        originalContent: node.metadata.content,
        proposedContent,
        createdAt: new Date().toISOString(),
        sourceToolName: 'propose_prompt_enrichment'
      }
      context.setPendingChange(change)
      return {
        ok: true,
        message: '已生成提示词候选，等待确认后应用。',
        data: { change },
        pendingChange: change,
        focusNodeId: node.id
      }
    }
  },
  {
    permission: 'confirm',
    definition: toolDefinition('apply_pending_change', '应用一个 pending change。需要 change_id。', {
      type: 'object',
      properties: {
        change_id: { type: 'string', description: '待应用变更 ID。' }
      },
      required: ['change_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const changeId = readRequiredString(args, 'change_id', 'changeId')
      const change = context.getPendingChange(changeId)
      if (!change) throw new Error('待应用变更不存在或已过期。')
      const project = requireProject(context)
      const target = project.nodes.find((node) => node.id === change.targetNodeId)
      if (!target) throw new Error('待应用变更的目标节点不存在。')
      await context.updateNodeContent(change.targetNodeId, change.proposedContent)
      context.clearPendingChange(changeId)
      return {
        ok: true,
        message: `已应用变更到 ${target.title}。`,
        data: { changeId, targetNodeId: change.targetNodeId },
        focusNodeId: change.targetNodeId
      }
    }
  },
  {
    permission: 'confirm',
    definition: toolDefinition('confirm_tool_plan', '生成需要用户确认的工具计划说明。V1 不会自动执行批量高风险计划。', {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '需要用户确认的计划摘要。' }
      },
      required: ['summary'],
      additionalProperties: false
    }),
    async execute(args) {
      const summary = readRequiredString(args, 'summary')
      return {
        ok: false,
        message: `需要确认：${summary}`,
        data: { requiresConfirmation: true, summary }
      }
    }
  },
  {
    permission: 'auto',
    definition: toolDefinition('cancel_pending_change', '取消一个 pending change。需要 change_id。', {
      type: 'object',
      properties: {
        change_id: { type: 'string', description: '待取消变更 ID。' }
      },
      required: ['change_id'],
      additionalProperties: false
    }),
    async execute(args, context) {
      const changeId = readRequiredString(args, 'change_id', 'changeId')
      context.clearPendingChange(changeId)
      return {
        ok: true,
        message: '已取消待确认变更。',
        data: { changeId }
      }
    }
  }
]

function toolDefinition(name: string, description: string, parameters: Record<string, unknown>): CanvasAgentToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters
    }
  }
}

function requireProject(context: CanvasAgentToolContext): CanvasProject {
  const project = context.getProject()
  if (!project) throw new Error('Canvas project 尚未准备好。')
  return project
}

function resolveCanvasAgentNode(
  project: CanvasProject,
  reference: string,
  expectedType?: CanvasNodeType,
  fallbackMessage?: string
): CanvasNodeData {
  const readableReference = cleanupNodeReference(reference)
  const normalizedReference = normalizeNodeReference(readableReference)
  const candidates = expectedType ? project.nodes.filter((node) => node.type === expectedType) : project.nodes
  const matchedById = candidates.find((node) => normalizeNodeReference(node.id) === normalizedReference)
  if (matchedById) return matchedById

  const matchedByLabel = candidates.filter((node) => normalizeNodeReference(nodeAgentLabel(node, project.nodes)) === normalizedReference)
  if (matchedByLabel.length === 1) return matchedByLabel[0]
  if (matchedByLabel.length > 1) throw new Error(`找到多个节点：${readableReference}`)

  const matchedByTitle = candidates.filter((node) => normalizeNodeReference(node.title) === normalizedReference)
  if (matchedByTitle.length === 1) return matchedByTitle[0]
  if (matchedByTitle.length > 1) throw new Error(`找到多个名为 ${readableReference} 的节点，请使用节点 ID 或可见序号。`)

  const ordinal = parseReadableOrdinal(readableReference)
  if (ordinal) {
    const ordinalCandidates = candidates.filter((node) => (
      normalizeNodeReference(node.title) === ordinal.base
      || normalizeNodeReference(nodeTypeLabel(node.type)) === ordinal.base
    ))
    const matchedByOrdinal = ordinalCandidates[ordinal.index - 1]
    if (matchedByOrdinal) return matchedByOrdinal
  }

  throw new Error(fallbackMessage || `未找到节点：${reference}`)
}

function cleanupNodeReference(reference: string): string {
  const trimmed = reference.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim()
  const withoutMention = trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed
  const actionIndex = [
    ' 丰富',
    ' 优化',
    ' 扩写',
    ' 润色',
    ' 生成',
    ' 运行',
    ' 连接',
    ' 并',
    ' 然后',
    ' 再',
    ' 测试'
  ]
    .map((token) => withoutMention.indexOf(token))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0]
  return (actionIndex ? withoutMention.slice(0, actionIndex) : withoutMention).trim()
}

function normalizeNodeReference(value: string): string {
  return value.trim().replace(/\s*#\s*/g, '#').replace(/\s+/g, ' ').toLocaleLowerCase()
}

function parseReadableOrdinal(reference: string): { base: string; index: number } | null {
  const normalized = normalizeNodeReference(reference)
  const hashMatch = /^(.+?)#(\d+)$/u.exec(normalized)
  if (hashMatch) return { base: hashMatch[1], index: Math.max(1, Number(hashMatch[2])) }

  const leadingOrdinal = /^第\s*(\d+)\s*个?\s*(.+)$/u.exec(reference.trim())
  if (leadingOrdinal) return { base: normalizeNodeReference(leadingOrdinal[2]), index: Math.max(1, Number(leadingOrdinal[1])) }

  return null
}

function nodeTypeLabel(type: CanvasNodeType): string {
  if (type === 'text') return '文本节点'
  if (type === 'generate') return '生成节点'
  if (type === 'config') return '配置节点'
  if (type === 'batch') return '批量节点'
  if (type === 'result') return '结果节点'
  return '图片节点'
}

function readRequiredString(args: Record<string, unknown>, key: string, altKey?: string): string {
  const value = readOptionalString(args, key, altKey)
  if (!value) throw new Error(`缺少参数：${key}`)
  return value
}

function readOptionalString(args: Record<string, unknown>, key: string, altKey?: string): string {
  const value = args[key] ?? (altKey ? args[altKey] : undefined)
  return typeof value === 'string' ? value.trim() : ''
}

function readBoolean(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true
}
