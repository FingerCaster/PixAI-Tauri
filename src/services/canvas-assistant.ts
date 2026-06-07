import type { CanvasNodeType } from '../shared/types'

export type CanvasAssistantNodeRef = {
  id?: string
  name?: string
  nodeType?: CanvasNodeType
  ordinal?: number
  latest?: boolean
}

export type CanvasAssistantCreateNodeAction = { type: 'create-node'; nodeType: CanvasNodeType; content?: string; title?: string }
export type CanvasAssistantEnrichPromptAction = { type: 'enrich-prompt'; targetRef: CanvasAssistantNodeRef }
export type CanvasAssistantGenerateFromTextAction = { type: 'generate-from-text'; targetRef: CanvasAssistantNodeRef }

export type CanvasAssistantAction =
  | CanvasAssistantCreateNodeAction
  | { type: 'create-chain'; prompt: string; run?: boolean; textTitle?: string; generateTitle?: string }
  | { type: 'connect'; fromRef: CanvasAssistantNodeRef; toRef: CanvasAssistantNodeRef }
  | { type: 'set-prompt'; targetRef: CanvasAssistantNodeRef; content: string }
  | CanvasAssistantEnrichPromptAction
  | CanvasAssistantGenerateFromTextAction
  | { type: 'run-node'; targetRef?: CanvasAssistantNodeRef }
  | { type: 'run-workflow' }

export type CanvasAssistantPlan = {
  actions: CanvasAssistantAction[]
  summary: string
  hints: string[]
}

const EXAMPLE_HINTS = [
  '试试：创建文本节点：赛博城市夜景',
  '试试：创建文本节点：赛博城市夜景，然后生成并运行',
  '试试：连接第1个文本到第1个生成',
  '试试：修改最新文本为：电影感猫咪肖像',
  '试试：运行最新生成'
]

export function parseCanvasAssistantCommand(input: string): CanvasAssistantPlan {
  const message = normalizeCommand(input)
  if (!message) return unknownPlan()

  if (isRunWorkflowCommand(message)) {
    return plan([{ type: 'run-workflow' }], '准备运行整个 Canvas workflow。')
  }

  const chainText = extractCreateTextSpec(message)
  if (chainText.content && wantsGenerate(message)) {
    return plan([
      {
        type: 'create-chain',
        prompt: chainText.content,
        run: wantsRun(message),
        ...(chainText.title ? { textTitle: chainText.title } : {})
      }
    ], wantsRun(message) ? '准备创建文本到生成节点的链路，并运行生成。' : '准备创建文本到生成节点的链路。')
  }

  const setPrompt = parseSetPromptCommand(message)
  if (setPrompt) {
    return plan([setPrompt], '准备修改节点提示词。')
  }

  const enrichPrompt = parseEnrichPromptCommand(message)
  if (enrichPrompt) {
    const actions: CanvasAssistantAction[] = [enrichPrompt]
    if (wantsGenerate(message)) {
      actions.push({ type: 'generate-from-text', targetRef: enrichPrompt.targetRef })
    }
    return plan(actions, actions.length > 1 ? '准备丰富节点提示词，并从该文本节点生成图片。' : '准备丰富节点提示词。')
  }

  const connect = parseConnectCommand(message)
  if (connect) {
    return plan([connect], '准备连接两个节点。')
  }

  const createNode = parseCreateNodeCommand(message)
  if (createNode) {
    return plan([createNode], `准备创建${nodeTypeLabel(createNode.nodeType)}。`)
  }

  const runNode = parseRunNodeCommand(message)
  if (runNode) {
    return plan([runNode], '准备运行生成节点。')
  }

  return unknownPlan()
}

function parseCreateNodeCommand(message: string): CanvasAssistantCreateNodeAction | null {
  if (!/(创建|新增|添加|加一个|加个)/.test(message)) return null
  const nodeType = parseNodeType(message)
  if (!nodeType) return null
  const spec = nodeType === 'text' || nodeType === 'generate' || nodeType === 'batch'
    ? extractCreateNodeSpec(message, nodeType)
    : { content: '', title: extractTitleMention(message) }
  return {
    type: 'create-node',
    nodeType,
    ...(spec.content ? { content: spec.content } : {}),
    ...(spec.title ? { title: spec.title } : {})
  }
}

function parseConnectCommand(message: string): CanvasAssistantAction | null {
  const match = /(?:连接|连线|链接)\s*(.+?)\s*(?:到|->|→)\s*(.+)$/u.exec(message)
  if (!match) return null
  const fromRef = parseNodeRef(match[1])
  const toRef = parseNodeRef(match[2])
  if (!fromRef || !toRef) return null
  return { type: 'connect', fromRef, toRef }
}

function parseSetPromptCommand(message: string): CanvasAssistantAction | null {
  const match = /(?:修改|设置|更新|改)\s*(.+?)\s*(?:为|成|:|：)\s*(?:：|:)?\s*(.+)$/iu.exec(message)
  if (!match) return null
  const targetRef = parseNodeRef(match[1])
  const content = cleanupContent(match[2])
  if (!targetRef || !content) return null
  return { type: 'set-prompt', targetRef, content }
}

function parseEnrichPromptCommand(message: string): CanvasAssistantEnrichPromptAction | null {
  if (!/(丰富|优化|扩写|润色)/.test(message)) return null

  const targetFirst = /^(.+?)\s*(?:丰富|优化|扩写|润色)\s*(?:(?:这个|当前)\s*)?(?:节点)?\s*(?:提示词|文本|prompt)?(?:\s*(?:，|,)?\s*(?:然后|并且|并|再).*)?$/iu.exec(message)
  if (targetFirst) {
    const targetRef = parseNodeRef(targetFirst[1])
    if (targetRef) return { type: 'enrich-prompt', targetRef }
  }

  const enrichFirst = /^(?:丰富|优化|扩写|润色)\s*(.+)$/iu.exec(message)
  if (enrichFirst) {
    const targetRef = parseNodeRef(cleanupEnrichTarget(enrichFirst[1]))
    if (targetRef) return { type: 'enrich-prompt', targetRef }
  }

  return null
}

function parseRunNodeCommand(message: string): CanvasAssistantAction | null {
  if (!/(运行|生成|执行)/.test(message)) return null
  if (/工作流|workflow/i.test(message)) return null
  if (!/(生成|节点|最新|第\d+)/.test(message)) return null
  return { type: 'run-node', targetRef: parseNodeRef(message) || { nodeType: 'generate', latest: true } }
}

function parseNodeRef(input: string): CanvasAssistantNodeRef | null {
  let name = parseAtMention(input)
  const nodeType = parseNodeType(input)
  const latest = /最新|最后|刚才|最近/.test(input)
  const ordinal = parseOrdinal(input)
  if (name && nodeType && ordinal != null && normalizeNodeRefName(name) === normalizeNodeRefName(nodeTypeLabel(nodeType))) {
    name = null
  }
  if (!name && !nodeType && !latest && ordinal == null) return null
  return {
    ...(name ? { name } : {}),
    ...(nodeType ? { nodeType } : {}),
    ...(latest ? { latest: true } : {}),
    ...(ordinal != null ? { ordinal } : {})
  }
}

function parseNodeType(input: string): CanvasNodeType | null {
  if (/生成|generate/i.test(input)) return 'generate'
  if (/提示词|prompt|文本|text/i.test(input)) return 'text'
  if (/配置|参数|config/i.test(input)) return 'config'
  if (/批量|batch/i.test(input)) return 'batch'
  if (/结果|result/i.test(input)) return 'result'
  if (/图片|图像|image/i.test(input)) return 'image'
  return null
}

function parseOrdinal(input: string): number | null {
  const arabic = /第\s*(\d+)\s*个?/u.exec(input)
  if (arabic) return Math.max(1, Number(arabic[1]))
  const simple = /(?:^|\D)(\d+)(?:\D|$)/u.exec(input)
  if (simple) return Math.max(1, Number(simple[1]))
  const chineseMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const chinese = /第\s*([一二三四五六七八九十])\s*个?/u.exec(input)
  return chinese ? chineseMap[chinese[1]] || null : null
}

function extractCreateTextSpec(message: string): { content: string; title: string } {
  const match = /(?:创建|新增|添加|加一个|加个)\s*(?:文本节点|文本|text|提示词节点)?\s*(?:：|:|为|内容是|内容为)?\s*(.+)$/iu.exec(message)
  if (!match) return { content: '', title: '' }
  return extractTitledContent(match[1].replace(/(?:，|,)?\s*(?:然后|并且|并)\s*(?:生成|创建生成|运行生成|生成并运行).*$/u, ''))
}

function extractCreateNodeSpec(message: string, nodeType: CanvasNodeType): { content: string; title: string } {
  const typePattern = nodeType === 'text'
    ? '(?:文本节点|文本|text|提示词节点)'
    : nodeType === 'generate'
      ? '(?:生成节点|生成|generate)'
      : nodeType === 'batch'
        ? '(?:批量节点|批量|batch)'
        : ''
  const match = new RegExp(`(?:创建|新增|添加|加一个|加个)\\s*${typePattern}\\s*(?:：|:|为|内容是|内容为)?\\s*(.+)$`, 'iu').exec(message)
  if (!match) return { content: '', title: extractTitleMention(message) }
  return extractTitledContent(match[1].replace(/(?:，|,)?\s*(?:然后|并且|并)\s*(?:生成|创建生成|运行生成|生成并运行).*$/u, ''))
}

function wantsGenerate(message: string): boolean {
  return /(?:然后|并且|并|再).*(?:生成|创建生成)/u.test(message) || /生成并运行/u.test(message)
}

function wantsRun(message: string): boolean {
  return /运行|执行|生成并运行/u.test(message)
}

function isRunWorkflowCommand(message: string): boolean {
  return /(运行|执行).*(工作流|workflow)/iu.test(message) || /(工作流|workflow).*(运行|执行)/iu.test(message)
}

function cleanupContent(value: string): string {
  return value.trim().replace(/^[："':“”]+|["'“”]+$/g, '').trim()
}

function cleanupEnrichTarget(value: string): string {
  return cleanupContent(value)
    .replace(/\s*(?:，|,)?\s*(?:然后|并且|并|再).+$/u, '')
    .replace(/\s*(?:(?:这个|当前)\s*)?(?:节点)?\s*(?:提示词|文本|prompt)\s*$/iu, '')
    .replace(/\s*(?:(?:这个|当前)\s*)节点\s*$/iu, '')
    .trim()
}

function extractTitledContent(value: string): { content: string; title: string } {
  const title = parseAtMention(value)
  const content = cleanupContent(title ? value.replace(new RegExp(`@${escapeRegExp(title)}\\s*`, 'u'), '') : value)
  return { content, title: title || '' }
}

function extractTitleMention(value: string): string {
  return parseAtMention(value) || ''
}

function parseAtMention(value: string): string | null {
  const match = /@([^\s@，,。；;：:、]+)/u.exec(value)
  return match ? cleanupContent(match[1]) : null
}

function normalizeNodeRefName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeCommand(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

function plan(actions: CanvasAssistantAction[], summary: string): CanvasAssistantPlan {
  return { actions, summary, hints: [] }
}

function unknownPlan(): CanvasAssistantPlan {
  return {
    actions: [],
    summary: '我还不能确定要执行哪些画布操作。',
    hints: EXAMPLE_HINTS
  }
}

function nodeTypeLabel(type: CanvasNodeType): string {
  if (type === 'text') return '文本节点'
  if (type === 'generate') return '生成节点'
  if (type === 'config') return '配置节点'
  if (type === 'batch') return '批量节点'
  if (type === 'result') return '结果节点'
  return '图片节点'
}
