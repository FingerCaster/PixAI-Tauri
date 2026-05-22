import { invoke } from '@tauri-apps/api/core'
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

type LocalImageReadResult = ReferenceImageFilePayload

const memoryStorage = new Map<string, string>()
const memorySecrets = new Map<string, string>()

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function fetchJsonThroughPlatform(url: string, init: RequestInit): Promise<Response> {
  if (!isTauriRuntime()) return fetch(url, init)
  const headers = Object.fromEntries(new Headers(init.headers).entries())
  const result = await invoke<HttpProxyResponse>('http_proxy', {
    request: {
      url,
      method: init.method || 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : undefined
    }
  })
  return new Response(result.body, {
    status: result.status,
    statusText: result.status_text
  })
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
