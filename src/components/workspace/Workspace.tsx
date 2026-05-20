import { Composer } from './Composer'
import { ImageTile } from './ImageTile'
import { useAppStore } from '../../store/app-store'

export function Workspace() {
  const { activeConversationId, conversations, runsByConversation } = useAppStore()
  const conversation = conversations.find((item) => item.id === activeConversationId) || null
  const runs = activeConversationId ? runsByConversation[activeConversationId] || [] : []
  const items = runs.flatMap((run) => run.items)

  if (!conversation) return <div className="empty-state">请选择一个会话。</div>

  return (
    <section className="workspace">
      <Composer conversation={conversation} />
      <div className="canvas">
        <div className="canvas-head">
          <div className="history-title">
            <span>当前工作区</span>
          </div>
          <div className="workspace-summary">
            <span className="summary-chip total">共 {items.length} 条</span>
            <span className="summary-chip success">成功 {items.filter((item) => item.status === 'succeeded').length}</span>
            <span className="summary-chip danger">失败 {items.filter((item) => item.status === 'failed').length}</span>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="empty-state">
            <strong>准备生成</strong>
            <span>输入提示词或添加参考图，结果会出现在这里。</span>
          </div>
        ) : (
          <div className="image-grid">
            {items.map((item) => (
              <ImageTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
