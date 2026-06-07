import type {
  AdapterCapability,
  ConnectionTestResult,
  GenerateImageInput,
  ImageGenerationCallLog,
  ImageApiData,
  PromptAssistInput,
  ProviderProfile,
  ProviderType
} from '../shared/types'

export type ProviderRuntimeProfile = ProviderProfile & {
  apiKey: string | null
}

export type ImageGenerationRequest = {
  input: GenerateImageInput
  referenceImages: Array<{ name: string; mimeType: string; dataUrl: string; maskDataUrl?: string }>
  signal?: AbortSignal
  onCallLog?: (log: ImageGenerationCallLog) => void
  onPartialImage?: (partial: {
    image: ImageApiData
    requestIndex?: number
    partialImageIndex?: number
  }) => void
}

export type CanvasAgentToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type CanvasAgentToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type CanvasAgentChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: CanvasAgentToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string; name: string }

export type CanvasAgentTurnRequest = {
  messages: CanvasAgentChatMessage[]
  tools: CanvasAgentToolDefinition[]
  signal?: AbortSignal
}

export type CanvasAgentTurnResponse = {
  content: string
  toolCalls: CanvasAgentToolCall[]
  raw?: unknown
}

export interface ProviderAdapter {
  type: ProviderType
  label: string
  capabilities: AdapterCapability[]
  testConnection(profile: ProviderRuntimeProfile, signal?: AbortSignal): Promise<ConnectionTestResult>
  generateImage(profile: ProviderRuntimeProfile, request: ImageGenerationRequest): Promise<ImageApiData[]>
  inspirePrompt(profile: ProviderRuntimeProfile, input?: PromptAssistInput, signal?: AbortSignal): Promise<string>
  enrichPrompt(profile: ProviderRuntimeProfile, input: PromptAssistInput & { prompt: string }, signal?: AbortSignal): Promise<string>
  runCanvasAgentTurn?(
    profile: ProviderRuntimeProfile,
    request: CanvasAgentTurnRequest
  ): Promise<CanvasAgentTurnResponse>
}
