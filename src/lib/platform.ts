import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { CodexBridgeResponse, CodexSkillInstallRequest, CodexSkillStatus, ReferenceImageFilePayload } from '../shared/types'

type SecretWriteResult = {
  insecure_storage: boolean
  backend: string
}

type SecretReadResult = {
  value: string | null
  insecure_storage: boolean
  backend: string
}

type HttpProxyResponse = {
  status: number
  status_text: string
  body: string
}

export type PlatformFetchOptions = {
  timeoutMs?: number
  firstByteTimeoutMs?: number
}

export type PlatformStreamResponse = {
  status: number
  statusText: string
  text: string
}

type LocalImageReadResult = ReferenceImageFilePayload

const memoryStorage = new Map<string, string>()
const memorySecrets = new Map<string, string>()

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function fetchJsonThroughPlatform(url: string, init: RequestInit, options: PlatformFetchOptions = {}): Promise<Response> {
  if (!isTauriRuntime()) return fetch(url, init)
  const headers = Object.fromEntries(new Headers(init.headers).entries())
  let result: HttpProxyResponse
  try {
    result = await invoke<HttpProxyResponse>('http_proxy', {
      request: {
        url,
        method: init.method || 'GET',
        headers,
        body: typeof init.body === 'string' ? init.body : undefined,
        timeoutMs: options.timeoutMs,
        firstByteTimeoutMs: options.firstByteTimeoutMs
      }
    })
  } catch (error) {
    throw PlatformHttpProxyError.fromInvokeError(url, init.method || 'GET', error)
  }
  return new Response(result.body, {
    status: result.status,
    statusText: result.status_text
  })
}

export async function fetchTextStreamThroughPlatform(url: string, init: RequestInit, options: PlatformFetchOptions = {}): Promise<PlatformStreamResponse> {
  if (!isTauriRuntime()) {
    const response = await fetch(url, init)
    return {
      status: response.status,
      statusText: response.statusText,
      text: await response.text()
    }
  }

  const headers = Object.fromEntries(new Headers(init.headers).entries())
  const streamId = globalThis.crypto?.randomUUID?.() || `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const chunks: Uint8Array[] = []
  const decoder = new TextDecoder()
  let status = 0
  let statusText = ''
  let settled = false

  const streamPromise = new Promise<PlatformStreamResponse>((resolve, reject) => {
    void listen<PlatformStreamEvent>('pixai://http-proxy-stream', (event) => {
      const payload = event.payload
      if (payload.streamId !== streamId) return
      if (payload.kind === 'chunk') {
        if (payload.chunkBase64) chunks.push(base64ToBytes(payload.chunkBase64))
        return
      }
      if (typeof payload.status === 'number') status = payload.status
      if (typeof payload.statusText === 'string') statusText = payload.statusText
      if (payload.kind === 'error') {
        settled = true
        reject(new Error(payload.error || '平台代理流式请求失败。'))
        return
      }
      if (payload.kind === 'done') {
        settled = true
        try {
          const text = decodeUtf8Chunks(chunks, decoder)
          resolve({ status, statusText, text })
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }
    }).catch((error) => {
      if (!settled) reject(error)
    })
  })

  try {
    await invoke('http_proxy_stream', {
      request: {
        streamId,
        url,
        method: init.method || 'GET',
        headers,
        body: typeof init.body === 'string' ? init.body : undefined,
        timeoutMs: options.timeoutMs,
        firstByteTimeoutMs: options.firstByteTimeoutMs
      }
    })
    return await streamPromise
  } catch (error) {
    throw PlatformHttpProxyError.fromInvokeError(url, init.method || 'GET', error)
  }
}

export async function readJsonState(name: string): Promise<string | null> {
  if (isTauriRuntime()) {
    return invoke<string | null>('read_json_state', { name })
  }
  return memoryStorage.get(name) || globalThis.localStorage?.getItem(`pixai:${name}`) || null
}

export async function writeJsonState(name: string, payload: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('write_json_state', { name, payload })
    return
  }
  memoryStorage.set(name, payload)
  globalThis.localStorage?.setItem(`pixai:${name}`, payload)
}

export async function setProfileSecret(profileId: string, apiKey: string): Promise<{ insecureStorage: boolean; backend: string }> {
  if (isTauriRuntime()) {
    const result = await invoke<SecretWriteResult>('set_profile_secret', { profileId, apiKey })
    return { insecureStorage: result.insecure_storage, backend: result.backend }
  }
  memorySecrets.set(profileId, apiKey)
  return { insecureStorage: true, backend: 'browser-memory' }
}

export async function getProfileSecret(profileId: string): Promise<{ value: string | null; insecureStorage: boolean; backend: string }> {
  if (isTauriRuntime()) {
    const result = await invoke<SecretReadResult>('get_profile_secret', { profileId })
    return { value: result.value, insecureStorage: result.insecure_storage, backend: result.backend }
  }
  return { value: memorySecrets.get(profileId) || null, insecureStorage: true, backend: 'browser-memory' }
}

export async function deleteProfileSecret(profileId: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('delete_profile_secret', { profileId })
    return
  }
  memorySecrets.delete(profileId)
}

export async function getAppDataDir(): Promise<string> {
  if (isTauriRuntime()) return invoke<string>('app_data_dir')
  return 'browser-memory'
}

export async function readLocalImageFile(path: string): Promise<ReferenceImageFilePayload> {
  if (!isTauriRuntime()) throw new Error('本地图片路径只能在 Tauri 应用中读取。')
  const result = await invoke<LocalImageReadResult>('read_local_image_file', { path })
  return result
}

export async function writeDataUrlFile(directory: string, filename: string, dataUrl: string): Promise<string> {
  if (!isTauriRuntime()) throw new Error('导出图片只能在 Tauri 应用中执行。')
  return invoke<string>('write_data_url_file', { directory, filename, dataUrl })
}

export async function respondCodexBridge(response: CodexBridgeResponse): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke('codex_bridge_respond', { response })
}

export async function markCodexBridgeReady(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke('codex_bridge_ready')
}

export async function getCodexSkillStatus(name: string): Promise<CodexSkillStatus> {
  if (!isTauriRuntime()) {
    return {
      name,
      installed: false,
      path: 'browser-memory',
      skillMdPath: 'browser-memory/SKILL.md'
    }
  }
  return invoke<CodexSkillStatus>('codex_skill_status', { name })
}

export async function installCodexSkill(request: CodexSkillInstallRequest): Promise<CodexSkillStatus> {
  if (!isTauriRuntime()) throw new Error('Codex Skill 只能在 Tauri 应用中安装。')
  return invoke<CodexSkillStatus>('install_codex_skill', { request })
}

export function __resetPlatformStateForTests(): void {
  memoryStorage.clear()
  memorySecrets.clear()
  globalThis.localStorage?.clear()
}

export class PlatformHttpProxyError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PlatformHttpProxyError'
  }

  static fromInvokeError(endpoint: string, method: string, error: unknown): PlatformHttpProxyError {
    const diagnostics = parsePlatformError(error)
    const stage = typeof diagnostics.stage === 'string' ? diagnostics.stage : 'transport'
    const message = typeof diagnostics.message === 'string' && diagnostics.message.trim()
      ? diagnostics.message
      : error instanceof Error
        ? error.message
        : String(error || '平台代理请求失败。')
    return new PlatformHttpProxyError(message, {
      endpoint,
      method,
      stage,
      diagnostics
    })
  }
}

type PlatformStreamEvent = {
  streamId: string
  kind: 'chunk' | 'done' | 'error'
  status?: number
  statusText?: string
  chunkBase64?: string
  error?: string
}

function parsePlatformError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }
  if (typeof error !== 'string') return { value: String(error) }
  try {
    const parsed = JSON.parse(error)
    return isRecord(parsed) ? parsed : { value: error }
  } catch {
    return { message: error, stage: inferPlainPlatformErrorStage(error) }
  }
}

function decodeUtf8Chunks(chunks: Uint8Array[], decoder: TextDecoder): string {
  let text = ''
  for (const chunk of chunks) {
    text += decoder.decode(chunk, { stream: true })
  }
  text += decoder.decode()
  return text
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function inferPlainPlatformErrorStage(message: string): string {
  if (message.startsWith('接口地址无效') || message.startsWith('仅支持 HTTP/HTTPS') || message.startsWith('请求方法无效')) {
    return 'configuration'
  }
  return 'transport'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
