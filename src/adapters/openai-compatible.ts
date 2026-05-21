import {
  buildImageEditEndpoint,
  buildImageEndpoint,
  buildResponsesEndpoint,
  getDefaultImageSize,
  supportsImageInputFidelity,
  trimBaseUrl
} from '../shared/image-options'
import { fetchJsonThroughPlatform } from '../lib/platform'
import type { ImageApiData } from '../shared/types'
import type { ImageGenerationRequest, ProviderAdapter, ProviderRuntimeProfile } from './types'

type ImageApiResponse = {
  data?: ImageApiData[]
  error?: {
    message?: string
    type?: string
    code?: string
    param?: string
  }
  error_code?: string
  message?: string
}

type ResponsesApiPayload = {
  output_text?: string
  output?: Array<{
    content?: Array<{ text?: string } | string> | string
  }>
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
  error_code?: string
  message?: string
}

export const openAiCompatibleAdapter: ProviderAdapter = {
  type: 'openai-compatible',
  label: 'OpenAI 兼容接口',
  capabilities: ['text-to-image', 'image-to-image', 'prompt-assist', 'connection-test', 'streaming', 'input-fidelity'],
  async testConnection(profile, signal) {
    const startedAt = Date.now()
    const endpoint = buildResponsesEndpoint(profile.baseUrl)
    if (!profile.apiKey) {
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        endpoint,
        message: 'API Key 尚未配置。'
      }
    }

    try {
      const response = await fetchJsonThroughPlatform(endpoint, {
        method: 'POST',
        headers: buildHeaders(profile.apiKey),
        signal,
        body: JSON.stringify({
          model: profile.defaultPromptModel,
          input: '请只回复 OK。',
          max_output_tokens: 8
        })
      })
      const text = await response.text()
      const payload = parseResponsesPayload(text)
      return {
        ok: response.ok,
        checkedAt: new Date().toISOString(),
        endpoint,
        status: response.status,
        latencyMs: Date.now() - startedAt,
        message: response.ok ? '连接测试成功。' : getProviderErrorMessage(payload, `连接失败，HTTP 状态码 ${response.status}。`)
      }
    } catch (error) {
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        endpoint,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : '连接测试失败。'
      }
    }
  },
  async generateImage(profile, request) {
    if (!profile.apiKey) throw new Error('API Key 尚未配置。')
    const hasReferences = request.referenceImages.length > 0
    const endpoint = hasReferences ? buildImageEditEndpoint(profile.baseUrl) : buildImageEndpoint(profile.baseUrl)
    const response = hasReferences
      ? await requestImageEdit(endpoint, profile, request)
      : await requestImageGeneration(endpoint, profile, request)
    const text = await response.text()
    const payload = parseImagePayload(text)
    if (!response.ok) {
      throw new ProviderHttpError(getProviderErrorMessage(payload, `图片请求失败，HTTP 状态码 ${response.status}。`), {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        responseBody: text,
        responseError: payload.error
      })
    }
    return payload.data || []
  },
  inspirePrompt(profile, input = {}, signal) {
    return requestPrompt(
      profile,
      [
        '请生成一条可直接用于图像生成的中文提示词。',
        '提示词需要包含主体、场景、构图、光线、风格、细节与氛围。',
        input.hasReferenceImages ? '当前会话包含参考图，请提示保留参考图主体和风格方向。' : '',
        '只输出提示词正文，不要解释，不要加标题。'
      ]
        .filter(Boolean)
        .join('\n'),
      signal
    )
  },
  enrichPrompt(profile, input, signal) {
    const prompt = input.prompt.trim()
    if (!prompt) throw new Error('请先输入提示词。')
    return requestPrompt(
      profile,
      [
        '请丰富并优化下面的图像生成提示词。',
        '保持用户原意和核心主体不变，跟随原提示词语言输出。',
        '补充视觉细节、镜头/构图、材质、光影、风格描述。',
        input.hasReferenceImages ? '当前会话包含参考图，请保留参考图主体和风格方向。' : '',
        '只输出优化后的提示词正文，不要解释，不要加标题。',
        '',
        prompt
      ]
        .filter((line) => line !== '')
        .join('\n'),
      signal
    )
  }
}

async function requestImageGeneration(endpoint: string, profile: ProviderRuntimeProfile, request: ImageGenerationRequest): Promise<Response> {
  const { input } = request
  return fetchJsonThroughPlatform(endpoint, {
    method: 'POST',
    headers: buildHeaders(profile.apiKey || ''),
    signal: request.signal,
    body: JSON.stringify({
      model: input.model || profile.defaultImageModel,
      prompt: input.prompt.trim(),
      size: input.size || getDefaultImageSize(input.ratio),
      quality: input.quality,
      n: Math.min(10, Math.max(1, input.n || 1)),
      ...(input.outputFormat ? { output_format: input.outputFormat } : {}),
      ...(input.outputCompression != null ? { output_compression: input.outputCompression } : {}),
      ...(input.background ? { background: input.background } : {}),
      ...(input.moderation ? { moderation: input.moderation } : {}),
      ...(input.stream ? { stream: input.stream } : {}),
      ...(input.stream && input.partialImages ? { partial_images: input.partialImages } : {})
    })
  })
}

async function requestImageEdit(endpoint: string, profile: ProviderRuntimeProfile, request: ImageGenerationRequest): Promise<Response> {
  const { input } = request
  const form = new FormData()
  form.set('model', input.model || profile.defaultImageModel)
  form.set('prompt', input.prompt.trim())
  form.set('size', input.size || getDefaultImageSize(input.ratio))
  form.set('quality', input.quality)
  form.set('n', String(Math.min(10, Math.max(1, input.n || 1))))
  if (input.outputFormat) form.set('output_format', input.outputFormat)
  if (input.outputCompression != null) form.set('output_compression', String(input.outputCompression))
  if (input.background) form.set('background', input.background)
  if (input.moderation) form.set('moderation', input.moderation)
  if (input.stream) form.set('stream', 'true')
  if (input.stream && input.partialImages) form.set('partial_images', String(input.partialImages))
  if (input.inputFidelity && supportsImageInputFidelity(input.model || profile.defaultImageModel)) {
    form.set('input_fidelity', input.inputFidelity)
  }
  for (const reference of request.referenceImages) {
    form.append('image[]', dataUrlToBlob(reference.dataUrl, reference.mimeType), reference.name)
  }
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${profile.apiKey || ''}`
    },
    signal: request.signal,
    body: form
  })
}

async function requestPrompt(profile: ProviderRuntimeProfile, instruction: string, signal?: AbortSignal): Promise<string> {
  if (!profile.apiKey) throw new Error('API Key 尚未配置。')
  const endpoint = buildResponsesEndpoint(profile.baseUrl)
  const response = await fetchJsonThroughPlatform(endpoint, {
    method: 'POST',
    headers: buildHeaders(profile.apiKey),
    signal,
    body: JSON.stringify({
      model: profile.defaultPromptModel,
      input: [
        {
          role: 'system',
          content: '你是专业图像生成提示词助手，输出简洁、具体、可直接用于生成图片的提示词。'
        },
        {
          role: 'user',
          content: instruction
        }
      ],
      max_output_tokens: 700
    })
  })
  const text = await response.text()
  const payload = parseResponsesPayload(text)
  if (!response.ok) {
    throw new ProviderHttpError(getProviderErrorMessage(payload, `提示词生成失败，HTTP 状态码 ${response.status}。`), {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      responseBody: text,
      responseError: payload.error
    })
  }
  const prompt = sanitizePromptText(extractResponseText(payload))
  if (!prompt) throw new Error('提示词助手没有返回内容。')
  return prompt
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

function parseImagePayload(text: string): ImageApiResponse {
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as ImageApiResponse
  } catch {
    return {}
  }
}

function parseResponsesPayload(text: string): ResponsesApiPayload {
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as ResponsesApiPayload
  } catch {
    return {}
  }
}

function extractResponseText(payload: ResponsesApiPayload): string {
  if (typeof payload.output_text === 'string') return payload.output_text
  for (const output of payload.output || []) {
    if (typeof output.content === 'string') return output.content
    for (const content of output.content || []) {
      if (typeof content === 'string') return content
      if (typeof content.text === 'string') return content.text
    }
  }
  return payload.choices?.find((choice) => typeof choice.message?.content === 'string')?.message?.content || ''
}

function getProviderErrorMessage(payload: ImageApiResponse | ResponsesApiPayload, fallback: string): string {
  const message = payload.error?.message || payload.message || fallback
  return payload.error_code && !message.includes(payload.error_code)
    ? `${message}（${payload.error_code}）`
    : message
}

function sanitizePromptText(value: string): string {
  const trimmed = value.trim()
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/)
  return (fenceMatch?.[1] || trimmed).trim()
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) return new Blob([], { type: fallbackMimeType })
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: match[1] || fallbackMimeType })
}

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ProviderHttpError'
  }
}

export function defaultOpenAiBaseUrl(): string {
  return trimBaseUrl('https://api.openai.com')
}
