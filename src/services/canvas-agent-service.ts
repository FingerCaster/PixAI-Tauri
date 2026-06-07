import { getAdapter } from '../adapters/registry'
import type { CanvasAgentTurnRequest, CanvasAgentTurnResponse } from '../adapters/types'
import type { ProviderSettingsStore } from './provider-settings'

export class CanvasAgentUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanvasAgentUnavailableError'
  }
}

export class CanvasAgentService {
  constructor(private readonly providers: ProviderSettingsStore) {}

  async runTurn(request: CanvasAgentTurnRequest): Promise<CanvasAgentTurnResponse> {
    const settings = await this.providers.get()
    if (!settings.selectedAgentProfileId) {
      throw new CanvasAgentUnavailableError('尚未配置 Canvas Agent Provider。')
    }
    const runtimeProfile = await this.providers.getRuntimeProfile(settings.selectedAgentProfileId)
    const adapter = getAdapter(runtimeProfile.type)
    if (!adapter.runCanvasAgentTurn) {
      throw new CanvasAgentUnavailableError('当前 Provider 不支持 Canvas Agent 原生工具调用。')
    }
    return adapter.runCanvasAgentTurn(runtimeProfile, request)
  }
}
