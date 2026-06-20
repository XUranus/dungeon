import { useState, useEffect } from 'react'
import { MessageSquare, Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { loadSessions, deleteSession, type ChatSession } from '../../utils/chatHistory'

interface Props {
  scope: 'public' | 'admin'
  currentSessionId: string | null
  onSelect: (session: ChatSession) => void
  onNew: () => void
  onDelete?: (sessionId: string) => void
}

export default function ChatHistoryPanel({ scope, currentSessionId, onSelect, onNew, onDelete }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setSessions(loadSessions(scope))
  }, [scope, currentSessionId])

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    deleteSession(scope, sessionId)
    setSessions(loadSessions(scope))
    onDelete?.(sessionId)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin}分钟前`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}小时前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-8 shrink-0 flex items-center justify-center glass dark:glass-dark border-r border-neutral-200/50 dark:border-neutral-700/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title="展开历史"
      >
        <ChevronRight className="w-4 h-4 text-neutral-400" />
      </button>
    )
  }

  return (
    <div className="w-56 shrink-0 flex flex-col glass dark:glass-dark border-r border-neutral-200/50 dark:border-neutral-700/50">
      {/* Header */}
      <div className="px-3 py-3 border-b border-neutral-200/50 dark:border-neutral-700/50 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">对话历史</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNew}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            title="新对话"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 transition-colors"
            title="收起"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
            暂无历史对话
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(s)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(s) }}
              className={`w-full text-left px-3 py-2 flex items-start gap-2 group transition-colors cursor-pointer ${
                s.id === currentSessionId
                  ? 'bg-neutral-100 dark:bg-neutral-800/50'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/30'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neutral-700 dark:text-neutral-300 truncate">
                  {s.title}
                </div>
                <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                  {formatTime(s.updatedAt)} · {s.messages.length}条
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, s.id)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/20 text-neutral-400 hover:text-red-500 transition-all shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
