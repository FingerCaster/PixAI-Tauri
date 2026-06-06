import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeJsonState } from '../lib/platform'
import type { CanvasConnection, CanvasNodeData } from '../shared/types'
import { CanvasProjectService, DEFAULT_CANVAS_VIEWPORT } from './canvas-projects'

const STATE_NAME = 'pixai-canvas-projects'

describe('CanvasProjectService', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await writeJsonState(STATE_NAME, JSON.stringify({ projects: [] }))
  })

  it('creates, lists, and updates a canvas project', async () => {
    const service = new CanvasProjectService()

    const created = await service.create({ conversationId: 'conversation-canvas-test', title: '  测试画布  ' })
    expect(created).toMatchObject({
      title: '测试画布',
      conversationId: 'conversation-canvas-test',
      schemaVersion: 1,
      nodes: [],
      connections: [],
      viewport: DEFAULT_CANVAS_VIEWPORT
    })

    const summaries = await service.list()
    expect(summaries).toEqual([
      expect.objectContaining({
        id: created.id,
        title: '测试画布',
        conversationId: 'conversation-canvas-test',
        nodeCount: 0
      })
    ])

    const updated = await service.update(created.id, {
      viewport: { x: 10.4, y: -20.6, k: 4 }
    })
    expect(updated.viewport).toEqual({ x: 10, y: -21, k: 3 })
  })

  it('exports a defensive clone of the selected project', async () => {
    const service = new CanvasProjectService()
    const created = await service.create({ conversationId: 'conversation-export-test', title: '可导出画布' })
    const textNode: CanvasNodeData = {
      id: 'node-export-text',
      type: 'text',
      title: '文本节点',
      position: { x: 10, y: 20 },
      width: 220,
      height: 140,
      metadata: { content: 'original' }
    }
    await service.update(created.id, { nodes: [textNode] })

    const exported = await service.exportProject(created.id)
    exported.nodes[0].metadata.content = 'mutated'

    await expect(service.get(created.id)).resolves.toMatchObject({
      nodes: [expect.objectContaining({ metadata: { content: 'original' } })]
    })
  })

  it('imports a canvas project as a new project bound to the current conversation', async () => {
    const service = new CanvasProjectService()
    const textNode: CanvasNodeData = {
      id: 'node-import-text',
      type: 'text',
      title: '文本节点',
      position: { x: 10.4, y: -20.6 },
      width: 220,
      height: 140,
      metadata: { content: 'prompt' }
    }
    const generateNode: CanvasNodeData = {
      id: 'node-import-generate',
      type: 'generate',
      title: '生成节点',
      position: { x: 300, y: 80 },
      width: 300,
      height: 260,
      metadata: {
        content: 'render this',
        status: 'running',
        runId: 'old-run',
        requestIndex: 0,
        errorMessage: 'still running',
        historyItemId: 'old-history'
      }
    }

    const imported = await service.importProject({
      id: 'canvas-exported-project',
      title: '外部项目',
      conversationId: 'old-conversation',
      schemaVersion: 1,
      nodes: [
        textNode,
        generateNode,
        { ...textNode, id: textNode.id, metadata: { content: 'duplicate' } },
        { ...textNode, id: 'bad-node', type: 'unknown' }
      ],
      connections: [
        { id: 'connection-ok', fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' },
        { id: 'connection-missing', fromNodeId: textNode.id, toNodeId: 'missing', kind: 'prompt' }
      ],
      viewport: { x: 2.4, y: -4.6, k: 0.01 }
    }, 'conversation-current-import')

    expect(imported).toMatchObject({
      title: '外部项目（导入）',
      conversationId: 'conversation-current-import',
      schemaVersion: 1,
      viewport: { x: 2, y: -5, k: 0.2 }
    })
    expect(imported.id).not.toBe('canvas-exported-project')
    expect(imported.nodes).toHaveLength(2)
    expect(imported.nodes[1]).toMatchObject({
      id: generateNode.id,
      type: 'generate',
      metadata: {
        content: 'render this',
        status: 'idle'
      }
    })
    expect(imported.nodes[1].metadata.runId).toBeUndefined()
    expect(imported.nodes[1].metadata.requestIndex).toBeUndefined()
    expect(imported.nodes[1].metadata.historyItemId).toBeUndefined()
    expect(imported.connections).toEqual([
      { id: 'connection-ok', fromNodeId: textNode.id, toNodeId: generateNode.id, kind: 'prompt' }
    ])
  })

  it('rejects unsupported canvas project schemas without changing persisted projects', async () => {
    const service = new CanvasProjectService()

    await expect(service.importProject({ schemaVersion: 99 }, 'conversation-schema-test')).rejects.toThrow('Unsupported Canvas project schema.')
    await expect(service.list()).resolves.toEqual([])
  })

  it('persists normalized nodes and filters invalid connections', async () => {
    const service = new CanvasProjectService()
    const created = await service.create({ conversationId: 'conversation-node-test' })
    const textNode: CanvasNodeData = {
      id: 'node-text',
      type: 'text',
      title: '文本节点',
      position: { x: 10.4, y: 20.6 },
      width: 220,
      height: 140,
      metadata: { content: 'hello canvas' }
    }
    const imageNode: CanvasNodeData = {
      id: 'node-image',
      type: 'image',
      title: '图片节点',
      position: { x: 300, y: 80 },
      width: 240,
      height: 180,
      metadata: {
        content: 'browser-memory/references/ref.png',
        referenceImageId: 'reference-1',
        historyItemId: 'history-1',
        storagePath: 'browser-memory/references/ref.png',
        mimeType: 'image/png',
        fileSizeBytes: 2,
        maskDataUrl: 'data:image/png;base64,TUFTSw==',
        maskUpdatedAt: '2026-06-06T10:00:00.000Z'
      }
    }
    const connections: CanvasConnection[] = [
      { id: 'connection-ok', fromNodeId: textNode.id, toNodeId: imageNode.id, kind: 'prompt' },
      { id: 'connection-duplicate', fromNodeId: textNode.id, toNodeId: imageNode.id, kind: 'prompt' },
      { id: 'connection-self', fromNodeId: textNode.id, toNodeId: textNode.id, kind: 'prompt' },
      { id: 'connection-cycle', fromNodeId: imageNode.id, toNodeId: textNode.id, kind: 'reference-image' },
      { id: 'connection-missing', fromNodeId: textNode.id, toNodeId: 'missing', kind: 'prompt' }
    ]

    const updated = await service.update(created.id, {
      nodes: [
        textNode,
        imageNode,
        { ...imageNode, id: 'bad-image', metadata: { content: 'not-an-image' } },
        { ...textNode, id: textNode.id, metadata: { content: 'duplicate' } }
      ],
      connections
    })

    expect(updated.nodes).toHaveLength(2)
    expect(updated.nodes[0]).toMatchObject({
      id: textNode.id,
      position: { x: 10, y: 21 }
    })
    expect(updated.connections).toEqual([{ id: 'connection-ok', fromNodeId: textNode.id, toNodeId: imageNode.id, kind: 'prompt' }])
    expect(updated.nodes[1].metadata).toMatchObject({
      content: 'browser-memory/references/ref.png',
      referenceImageId: 'reference-1',
      historyItemId: 'history-1',
      storagePath: 'browser-memory/references/ref.png',
      maskDataUrl: 'data:image/png;base64,TUFTSw==',
      maskUpdatedAt: '2026-06-06T10:00:00.000Z'
    })
    await expect(service.get(created.id)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: textNode.id }), expect.objectContaining({ id: imageNode.id })]),
      connections: [{ id: 'connection-ok', fromNodeId: textNode.id, toNodeId: imageNode.id, kind: 'prompt' }]
    })
  })

  it('loads old canvas projects without node arrays', async () => {
    await writeJsonState(STATE_NAME, JSON.stringify({
      projects: [
        {
          id: 'canvas-old-shell',
          title: '旧画布',
          conversationId: 'conversation-old',
          schemaVersion: 1,
          viewport: DEFAULT_CANVAS_VIEWPORT,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z'
        }
      ]
    }))

    const service = new CanvasProjectService()

    await expect(service.get('canvas-old-shell')).resolves.toMatchObject({
      id: 'canvas-old-shell',
      nodes: [],
      connections: []
    })
  })

  it('persists generate nodes and result connections', async () => {
    const service = new CanvasProjectService()
    const created = await service.create({ conversationId: 'conversation-generate-test' })
    const generateNode: CanvasNodeData = {
      id: 'node-generate',
      type: 'generate',
      title: '生成节点',
      position: { x: 100, y: 120 },
      width: 300,
      height: 260,
      metadata: {
        content: 'studio lighting',
        status: 'running',
        runId: 'run-canvas-generate',
        requestIndex: 0
      }
    }
    const imageNode: CanvasNodeData = {
      id: 'node-result',
      type: 'image',
      title: '结果图',
      position: { x: 464, y: 120 },
      width: 240,
      height: 180,
      metadata: {
        content: 'data:image/png;base64,AA==',
        historyItemId: 'history-canvas-result',
        mimeType: 'image/png',
        fileSizeBytes: 2
      }
    }

    const updated = await service.update(created.id, {
      nodes: [generateNode, imageNode],
      connections: [
        { id: 'connection-result', fromNodeId: generateNode.id, toNodeId: imageNode.id, kind: 'result' }
      ]
    })

    expect(updated.nodes[0]).toMatchObject({
      type: 'generate',
      metadata: {
        status: 'running',
        runId: 'run-canvas-generate',
        requestIndex: 0
      }
    })
    expect(updated.connections).toEqual([
      { id: 'connection-result', fromNodeId: generateNode.id, toNodeId: imageNode.id, kind: 'result' }
    ])
  })

  it('persists advanced workflow nodes and normalizes running result imports', async () => {
    const service = new CanvasProjectService()
    const imported = await service.importProject({
      title: '高级节点',
      schemaVersion: 1,
      nodes: [
        {
          id: 'node-config',
          type: 'config',
          title: '',
          position: { x: 10, y: 20 },
          width: 10,
          height: 20,
          metadata: {
            content: '',
            ratio: '16:9',
            quality: 'high',
            n: 9
          }
        },
        {
          id: 'node-batch',
          type: 'batch',
          title: '',
          position: { x: 300, y: 20 },
          width: 260,
          height: 220,
          metadata: { content: 'one\n\ntwo' }
        },
        {
          id: 'node-result',
          type: 'result',
          title: '',
          position: { x: 600, y: 20 },
          width: 260,
          height: 220,
          metadata: {
            content: 'data:image/png;base64,AA==',
            status: 'running',
            runId: 'old-run',
            requestIndex: 0,
            historyItemId: 'old-history',
            mimeType: 'image/png',
            fileSizeBytes: 2
          }
        },
        {
          id: 'node-bad-result',
          type: 'result',
          title: '坏结果',
          metadata: { content: 'not-an-image' }
        }
      ],
      connections: [
        { id: 'connection-config', fromNodeId: 'node-config', toNodeId: 'node-result', kind: 'config' },
        { id: 'connection-batch', fromNodeId: 'node-batch', toNodeId: 'node-result', kind: 'batch' },
        { id: 'connection-result-reference', fromNodeId: 'node-result', toNodeId: 'node-config', kind: 'reference-image' }
      ]
    }, 'conversation-advanced-import')

    expect(imported.nodes).toHaveLength(3)
    expect(imported.nodes[0]).toMatchObject({
      type: 'config',
      title: '配置节点',
      width: 80,
      height: 80,
      metadata: {
        ratio: '16:9',
        quality: 'high',
        n: 4
      }
    })
    expect(imported.nodes[1]).toMatchObject({
      type: 'batch',
      title: '批量节点',
      metadata: { content: 'one\n\ntwo' }
    })
    expect(imported.nodes[2]).toMatchObject({
      type: 'result',
      title: '结果节点',
      metadata: {
        content: 'data:image/png;base64,AA==',
        status: 'idle',
        mimeType: 'image/png',
        fileSizeBytes: 2
      }
    })
    expect(imported.nodes[2].metadata.runId).toBeUndefined()
    expect(imported.nodes[2].metadata.historyItemId).toBeUndefined()
    expect(imported.connections.map((connection) => connection.kind)).toEqual(['config', 'batch'])
  })

  it('recovers invalid persisted canvas state without leaking into app data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeJsonState(STATE_NAME, 'not-json')

    const service = new CanvasProjectService()

    await expect(service.list()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid canvas project state'), expect.anything())
    await expect(service.create({ conversationId: 'conversation-after-recovery' })).resolves.toMatchObject({
      conversationId: 'conversation-after-recovery'
    })
  })
})
