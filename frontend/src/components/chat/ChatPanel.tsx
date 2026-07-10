import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { Send, Loader2, Trash2, Square, Globe, TrendingUp, BarChart3, XCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { MarkdownMessage } from './MarkdownMessage'
import ChatHistoryPanel from './ChatHistoryPanel'
import { createSession, updateSession, loadSession, type ChatSession } from '../../utils/chatHistory'

const TOOL_LABELS: Record<string, { label: string; icon: typeof Globe }> = {
  web_search: { label: '正在搜索网络...', icon: Globe },
  get_stock_quote: { label: '正在查询行情...', icon: TrendingUp },
  get_market_overview: { label: '正在获取市场概况...', icon: BarChart3 },
}

interface Props {
  initialSessionId: string | null
}

export default function ChatPanel({ initialSessionId }: Props) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null)
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<UIMessage[]>([])

  // 加载初始消息
  const initialMessages = useMemo<UIMessage[]>(() => {
    if (!initialSessionId) return []
    const session = loadSession('admin', initialSessionId)
    if (!session) return []
    return session.messages.map((m, i) => ({
      id: `loaded_${i}`,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: m.content }],
    }))
  }, [initialSessionId])

  const { messages, sendMessage, setMessages, status, stop, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      headers: () => ({
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }),
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          id,
          message: messages[messages.length - 1]?.parts
            ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map(p => p.text)
            .join('') ?? '',
          history: messages.slice(0, -1).map(m => ({
            role: m.role,
            content: m.parts
              ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map(p => p.text)
              .join('') ?? '',
          })),
        },
      }),
    }),
    onData: (dataPart) => {
      // 处理工具事件
      if (dataPart.type === 'data-tool-progress') {
        const data = dataPart.data as { name: string; status: 'running' | 'done' }
        setActiveTools(prev => {
          const next = new Set(prev)
          if (data.status === 'running') next.add(data.name)
          else next.delete(data.name)
          return next
        })
      }
    },
    onFinish: () => {
      // 保存到历史（useChat 已将 assistant 消息加入 messages）
      const allMsgs = messagesRef.current.map(m => ({
        role: m.role,
        content: m.parts
          ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map(p => p.text)
          .join('') ?? '',
      }))
      if (allMsgs.length === 0) return
      if (sessionId) {
        updateSession('admin', sessionId, allMsgs)
      } else {
        const session = createSession('admin', allMsgs)
        setSessionId(session.id)
        navigate(`/admin/chat/${session.id}`, { replace: true })
      }
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // 同步 messages 到 ref，避免 onFinish 闭包引用过期
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // 从 URL 加载会话
  useEffect(() => {
    if (initialSessionId) {
      const session = loadSession('admin', initialSessionId)
      if (session) {
        setSessionId(session.id)
        setMessages(session.messages.map((m, i) => ({
          id: `loaded_${i}`,
          role: m.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: m.content }],
        })))
      } else {
        navigate('/admin/chat', { replace: true })
      }
    } else {
      setSessionId(null)
      setMessages([])
    }
  }, [initialSessionId, navigate, setMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTools])

  const handleSelectSession = (session: ChatSession) => {
    navigate(`/admin/chat/${session.id}`)
  }

  const handleNewChat = () => {
    navigate('/admin/chat')
  }

  const handleDeleteSession = (deletedId: string) => {
    if (deletedId === sessionId) {
      setSessionId(null)
      setMessages([])
      navigate('/admin/chat', { replace: true })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const input = form.elements.namedItem('message') as HTMLInputElement
    const text = input.value.trim()
    if (!text || isLoading) return
    input.value = ''
    sendMessage({ text })
  }

  // 提取文本内容的辅助函数
  const getTextContent = (msg: UIMessage): string =>
    msg.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join('') ?? ''

  return (
    <div className="flex h-full">
      <ChatHistoryPanel
        scope="admin"
        currentSessionId={sessionId}
        onSelect={handleSelectSession}
        onNew={handleNewChat}
        onDelete={handleDeleteSession}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="glass dark:glass-dark border-b border-neutral-200/50 dark:border-neutral-700/50 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              财经观点问答
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              基于大V观点数据库的 RAG 问答助手，支持多轮对话和实时信息查询
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-900/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              新对话
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-neutral-400 dark:text-neutral-500 mt-20">
              <p className="text-lg">有什么想了解的财经观点？</p>
              <p className="text-sm mt-2">试着问：最近大V们怎么看A股走势？</p>
            </div>
          )}
          {messages.map((msg) => {
            const text = getTextContent(msg)
            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                      : 'glass-card dark:glass-card-dark text-neutral-800 dark:text-neutral-200'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{text}</p>
                  ) : (
                    <MarkdownMessage content={text} isStreaming={isLoading && msg.id === messages[messages.length - 1]?.id} />
                  )}
                </div>
              </div>
            )
          })}
          {/* 工具调用状态 */}
          {isLoading && activeTools.size > 0 && (
            <div className="flex justify-start">
              <div className="glass-card dark:glass-card-dark rounded-2xl px-4 py-3 space-y-1.5">
                {Array.from(activeTools).map((toolName) => {
                  const meta = TOOL_LABELS[toolName] || { label: toolName, icon: Globe }
                  const Icon = meta.icon
                  return (
                    <div key={toolName} className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <Icon className="w-3 h-3" />
                      <span>{meta.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {/* 错误提示 */}
          {error && (
            <div className="flex justify-start">
              <div className="glass-card dark:glass-card-dark rounded-2xl px-4 py-3 text-red-500 text-sm">
                <XCircle size={14} className="inline mr-1.5 -mt-px" />{error.message || '请求出错，请稍后重试'}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="glass dark:glass-dark border-t border-neutral-200/50 dark:border-neutral-700/50 px-6 py-4">
          <div className="flex gap-2">
            <input
              name="message"
              placeholder="输入你的问题..."
              className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
              disabled={isLoading}
            />
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="bg-red-500 text-white rounded-xl px-4 py-2.5 hover:bg-red-600 transition-all"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={status !== 'ready'}
                className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl px-4 py-2.5 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
