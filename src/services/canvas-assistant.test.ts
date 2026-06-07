import { describe, expect, it } from 'vitest'
import { parseCanvasAssistantCommand } from './canvas-assistant'

describe('canvas assistant command parser', () => {
  it('parses a text-to-generate chain with run intent', () => {
    expect(parseCanvasAssistantCommand('创建文本节点：赛博城市夜景，然后生成并运行')).toMatchObject({
      actions: [
        {
          type: 'create-chain',
          prompt: '赛博城市夜景',
          run: true
        }
      ]
    })
  })

  it('parses individual node creation commands with content', () => {
    expect(parseCanvasAssistantCommand('创建文本节点：电影感猫咪肖像')).toMatchObject({
      actions: [
        {
          type: 'create-node',
          nodeType: 'text',
          content: '电影感猫咪肖像'
        }
      ]
    })
    expect(parseCanvasAssistantCommand('创建生成节点：局部生成提示词')).toMatchObject({
      actions: [
        {
          type: 'create-node',
          nodeType: 'generate',
          content: '局部生成提示词'
        }
      ]
    })
    expect(parseCanvasAssistantCommand('创建配置节点')).toMatchObject({
      actions: [
        {
          type: 'create-node',
          nodeType: 'config'
        }
      ]
    })
    expect(parseCanvasAssistantCommand('新增批量节点：红色\n蓝色')).toMatchObject({
      actions: [
        {
          type: 'create-node',
          nodeType: 'batch',
          content: '红色 蓝色'
        }
      ]
    })
    expect(parseCanvasAssistantCommand('创建结果节点')).toMatchObject({
      actions: [
        {
          type: 'create-node',
          nodeType: 'result'
        }
      ]
    })
  })

  it('parses node names from @ mentions', () => {
    expect(parseCanvasAssistantCommand('创建文本节点 @主提示词：电影感猫咪肖像')).toMatchObject({
      actions: [
        {
          type: 'create-node',
          nodeType: 'text',
          title: '主提示词',
          content: '电影感猫咪肖像'
        }
      ]
    })
    expect(parseCanvasAssistantCommand('创建生成节点 @最终生成：局部生成提示词')).toMatchObject({
      actions: [
        {
          type: 'create-node',
          nodeType: 'generate',
          title: '最终生成',
          content: '局部生成提示词'
        }
      ]
    })
    expect(parseCanvasAssistantCommand('创建文本节点 @主提示词：赛博城市夜景，然后生成')).toMatchObject({
      actions: [
        {
          type: 'create-chain',
          textTitle: '主提示词',
          prompt: '赛博城市夜景'
        }
      ]
    })
  })

  it('parses connection commands by ordinal node references', () => {
    expect(parseCanvasAssistantCommand('连接第1个文本到第2个生成')).toMatchObject({
      actions: [
        {
          type: 'connect',
          fromRef: { nodeType: 'text', ordinal: 1 },
          toRef: { nodeType: 'generate', ordinal: 2 }
        }
      ]
    })
  })

  it('parses node references from @ mentions', () => {
    expect(parseCanvasAssistantCommand('连接@主提示词到@最终生成')).toMatchObject({
      actions: [
        {
          type: 'connect',
          fromRef: { name: '主提示词' },
          toRef: { name: '最终生成' }
        }
      ]
    })
    expect(parseCanvasAssistantCommand('修改@主提示词为：柔和棚拍猫咪')).toMatchObject({
      actions: [
        {
          type: 'set-prompt',
          targetRef: { name: '主提示词' },
          content: '柔和棚拍猫咪'
        }
      ]
    })
    expect(parseCanvasAssistantCommand('运行@最终生成')).toMatchObject({
      actions: [
        {
          type: 'run-node',
          targetRef: { name: '最终生成' }
        }
      ]
    })
    expect(parseCanvasAssistantCommand('@主提示词 丰富当前节点提示词')).toMatchObject({
      actions: [
        {
          type: 'enrich-prompt',
          targetRef: { name: '主提示词' }
        }
      ]
    })
    expect(parseCanvasAssistantCommand('丰富@主提示词提示词')).toMatchObject({
      actions: [
        {
          type: 'enrich-prompt',
          targetRef: { name: '主提示词' }
        }
      ]
    })
    expect(parseCanvasAssistantCommand('@主提示词 丰富这个提示词')).toMatchObject({
      actions: [
        {
          type: 'enrich-prompt',
          targetRef: { name: '主提示词' }
        }
      ]
    })
    expect(parseCanvasAssistantCommand('@主提示词 丰富这个节点 并生成一张图')).toMatchObject({
      actions: [
        {
          type: 'enrich-prompt',
          targetRef: { name: '主提示词' }
        },
        {
          type: 'generate-from-text',
          targetRef: { name: '主提示词' }
        }
      ]
    })
    expect(parseCanvasAssistantCommand('@canvas-node_eee1ab0a-7ea8-4331-ace8-960310c43efb 丰富这个节点 并生成一张图 测试')).toMatchObject({
      actions: [
        {
          type: 'enrich-prompt',
          targetRef: { name: 'canvas-node_eee1ab0a-7ea8-4331-ace8-960310c43efb' }
        },
        {
          type: 'generate-from-text',
          targetRef: { name: 'canvas-node_eee1ab0a-7ea8-4331-ace8-960310c43efb' }
        }
      ]
    })
    expect(parseCanvasAssistantCommand('@文本节点 #2 丰富这个节点 并生成一张图 测试')).toMatchObject({
      actions: [
        {
          type: 'enrich-prompt',
          targetRef: { nodeType: 'text', ordinal: 2 }
        },
        {
          type: 'generate-from-text',
          targetRef: { nodeType: 'text', ordinal: 2 }
        }
      ]
    })
  })

  it('parses prompt updates and run commands', () => {
    expect(parseCanvasAssistantCommand('修改最新文本为：柔和棚拍猫咪')).toMatchObject({
      actions: [
        {
          type: 'set-prompt',
          targetRef: { nodeType: 'text', latest: true },
          content: '柔和棚拍猫咪'
        }
      ]
    })
    expect(parseCanvasAssistantCommand('运行最新生成')).toMatchObject({
      actions: [
        {
          type: 'run-node',
          targetRef: { nodeType: 'generate', latest: true }
        }
      ]
    })
    expect(parseCanvasAssistantCommand('运行工作流')).toMatchObject({
      actions: [{ type: 'run-workflow' }]
    })
  })

  it('returns hints for unknown commands without actions', () => {
    const result = parseCanvasAssistantCommand('帮我随便弄一下')

    expect(result.actions).toEqual([])
    expect(result.hints.length).toBeGreaterThan(0)
  })
})
