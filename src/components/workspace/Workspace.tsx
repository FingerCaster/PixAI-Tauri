import { Composer } from './Composer'
import { CanvasArea } from './CanvasArea'
import { useAppStore } from '../../store/app-store'

export function Workspace() {
  const { activeConversationId, conversations, generationClockMs, getConversationGenerationState, runsByConversation } = useAppStore()
  const conversation = conversations.find((item) => item.id === activeConversationId) || null
  const runs = activeConversationId ? runsByConversation[activeConversationId] || [] : []
  const generationState = activeConversationId
    ? getConversationGenerationState(activeConversationId)
    : { generating: false, startedAt: null, activeCount: 0 }

  if (!conversation) return <div className="empty-state">请选择一个会话。</div>

  return (
    <section className="workspace">
      <Composer conversation={conversation} generating={generationState.generating} />
      <CanvasArea
        runs={runs}
        generationStartedAt={generationState.startedAt}
        generating={generationState.generating}
        generationClockMs={generationClockMs}
      />
    </section>
  )
}
