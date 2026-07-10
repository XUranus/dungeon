import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import {
  Loader2, Send, ArrowUpRight, Heart, MessageSquare,
  Sparkles, ChevronRight,
  Wrench, Check, Search, BarChart3, Globe2, Calendar,
} from 'lucide-react'
import Logo from '../components/Logo'
import { MarkdownMessage } from '../components/chat/MarkdownMessage'
import RichContent from '../components/content/RichContent'
import { parseQA } from '../utils/qa'
import { Link } from 'react-router-dom'
import {
  fetchSystemInfo,
  fetchSystemOwner,
  fetchDashboardSummary,
  fetchDashboardStats,
  fetchEnabledPlugins,
  type DashboardSummaryItem,
  type PluginMeta,
} from '../services/api'
import { getVisitorId } from '../utils/visitor'

/* ── Platform config ── */
const PLATFORM_LABELS: Record<string, string> = {
  zhihu: '知乎', xueqiu: '雪球', xiaohongshu: '小红书',
  weibo: '微博', douyin: '抖音', zsxq: '星球',
}
const PLATFORM_COLORS: Record<string, string> = {
  zhihu: '#3B82F6', xueqiu: '#F97316', xiaohongshu: '#EF4444',
  weibo: '#F43F5E', douyin: '#A3A3A3', zsxq: '#10B981',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  if (diffH < 1) return '刚刚'
  if (diffH < 24) return `${diffH}小时前`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/* ── Hero Section ── */
function HeroSection({ title, subtitle, avatarUrl, ownerName, stats }: {
  title: string; subtitle: string; avatarUrl?: string; ownerName?: string
  stats?: { total: number; articles: number; qa: number }
}) {
  return (
    <section className="landing-hero">
      {/* Animated grid background */}
      <div className="hero-grid" />
      {/* Floating orbs */}
      <div className="hero-orb hero-orb-1" />
      <div className="hero-orb hero-orb-2" />
      <div className="hero-orb hero-orb-3" />
      {/* Radial glow */}
      <div className="hero-glow" />

      <div className="landing-hero-content">
        {/* Avatar */}
        <div className="hero-avatar-ring">
          <div className="hero-avatar-ring-inner" />
          <div className="hero-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="星主" className="hero-avatar-img" />
            ) : (
              <span className="hero-avatar-fallback">
                <Sparkles className="w-8 h-8" />
              </span>
            )}
          </div>
        </div>

        <div className="landing-hero-badge">
          <span className="hero-badge-dot" />
          <span>{ownerName || 'AI 驱动的智能投资研究'}</span>
        </div>
        <h1 className="landing-hero-title">{title}</h1>
        <p className="landing-hero-subtitle">{subtitle}</p>

        {/* Stats row */}
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-value">{stats?.articles ?? '—'}</span>
            <span className="hero-stat-label">文章</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-value">{stats?.qa ?? '—'}</span>
            <span className="hero-stat-label">问答</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-value">{stats?.total ?? '—'}</span>
            <span className="hero-stat-label">数据量</span>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="hero-scroll-hint">
        <div className="hero-scroll-mouse">
          <div className="hero-scroll-wheel" />
        </div>
      </div>
    </section>
  )
}

/* ── 市场动态时间线 ── */
function TimelineSection({ items, loading, avatarUrl }: { items: DashboardSummaryItem[]; loading: boolean; avatarUrl?: string }) {
  if (loading) {
    return (
      <section className="landing-section">
        <div className="landing-section-header">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <h2>市场动态</h2>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-600" />
        </div>
      </section>
    )
  }

  return (
    <section className="landing-section">
      <div className="landing-section-header">
        <MessageSquare className="w-4 h-4 text-emerald-400" />
        <h2>市场动态</h2>
        <span className="landing-section-tag">{items.length} 条动态</span>
      </div>
      <div className="landing-timeline">
        {items.map((item, i) => {
          const color = PLATFORM_COLORS[item.platform] || '#A3A3A3'
          const isQA = item.content_type === 'q&a'
          const qaParts = isQA ? parseQA(item.content_preview) : null
          return (
            <div
              key={item.id}
              className="landing-timeline-item"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="landing-timeline-dot" style={{ background: color }} />
              <div className="landing-timeline-line" />
              <div className="landing-card landing-insight-card">
                <div className="landing-insight-header">
                  <div className="landing-avatar-sm">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="landing-avatar-sm-img" />
                    ) : (
                      <span className="landing-avatar-sm-fallback">
                        {(PLATFORM_LABELS[item.platform] || item.platform)[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-neutral-400">
                        {PLATFORM_LABELS[item.platform] || item.platform}
                      </span>
                      {isQA && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-500">
                          问答
                        </span>
                      )}
                      <span className="text-xs text-neutral-600 ml-auto flex-shrink-0">
                        {formatDate(item.published_at)}
                      </span>
                    </div>
                    {isQA && qaParts ? (
                      <p className="text-sm text-neutral-200 mt-0.5 line-clamp-2">
                        {qaParts.find(p => p.type === 'question')?.text || item.title || ''}
                      </p>
                    ) : item.title ? (
                      <p className="text-sm text-neutral-300 truncate mt-0.5">{item.title}</p>
                    ) : null}
                  </div>
                </div>

                {isQA && qaParts ? (
                  (() => {
                    const answer = qaParts.find(p => p.type === 'answer')
                    return answer ? (
                      <div className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mt-2">
                        <RichContent content={answer.text} compact />
                      </div>
                    ) : null
                  })()
                ) : (
                  <div className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mt-2">
                    <RichContent content={item.content_preview} compact />
                  </div>
                )}

                <div className="flex items-center gap-3 mt-2">
                  {item.like_count > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-neutral-600">
                      <Heart className="w-3 h-3" /> {item.like_count}
                    </span>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-0.5 text-[11px] text-neutral-600 hover:text-emerald-400 transition-colors ml-auto"
                    >
                      查看 <ArrowUpRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── 工具调用卡片 ── */
const TOOL_META: Record<string, { label: string; icon: typeof Search; color: string }> = {
  search_knowledge: { label: '搜索知识库', icon: Search, color: 'text-emerald-400' },
  web_search: { label: '联网搜索', icon: Globe2, color: 'text-blue-400' },
  get_stock_quote: { label: '查询行情', icon: BarChart3, color: 'text-amber-400' },
  get_market_overview: { label: '市场概况', icon: BarChart3, color: 'text-amber-400' },
  get_current_date: { label: '确认日期', icon: Calendar, color: 'text-neutral-400' },
}

function isToolPart(p: Record<string, unknown>): boolean {
  const t = String(p.type || '')
  return t === 'dynamic-tool' || t.startsWith('tool-')
}

function ToolCallCard({ part }: { part: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const toolName = String(part.toolName || '')
  const meta = TOOL_META[toolName] || { label: toolName, icon: Wrench, color: 'text-neutral-400' }
  const Icon = meta.icon
  const state = String(part.state || '')
  const isRunning = state === 'input-streaming' || state === 'input-available'
  const isDone = state === 'output-available'
  const result = isDone ? String(part.output || '') : ''

  // 截取结果预览（第一行或前60字符）
  const preview = result.split('\n')[0].slice(0, 80)
  const showExpand = result.length > 80

  return (
    <div className="my-1.5">
      <button
        onClick={() => showExpand && setExpanded(!expanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all w-full text-left ${
          isRunning
            ? 'bg-neutral-800/50 text-neutral-300'
            : 'bg-neutral-800/30 text-neutral-500 hover:bg-neutral-800/50'
        }`}
      >
        {isRunning ? (
          <Loader2 className={`w-3 h-3 animate-spin ${meta.color}`} />
        ) : (
          <Check className="w-3 h-3 text-emerald-400" />
        )}
        <Icon className={`w-3 h-3 ${meta.color}`} />
        <span className="font-medium">{meta.label}</span>
        {isRunning && <span className="text-neutral-500 animate-pulse ml-1">执行中...</span>}
        {isDone && !expanded && (
          <span className="text-neutral-600 truncate ml-1 flex-1">{preview}</span>
        )}
        {showExpand && (
          <ChevronRight className={`w-3 h-3 ml-auto flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </button>
      {expanded && isDone && (
        <div className="mt-1 ml-5 px-3 py-2 rounded-lg bg-neutral-900/60 border border-neutral-800/50 text-xs text-neutral-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
          {result.slice(0, 1500)}{result.length > 1500 ? '...' : ''}
        </div>
      )}
    </div>
  )
}

/* ── AI 研究助手 ── */
function ResearchAssistant({
  messages, status, chatRemaining, systemSubtitle, sendMessage,
}: {
  messages: ReturnType<typeof useChat>['messages']
  status: ReturnType<typeof useChat>['status']
  chatRemaining: number
  systemSubtitle: string
  sendMessage: ReturnType<typeof useChat>['sendMessage']
}) {
  const chatEndRef = useRef<HTMLDivElement>(null)
  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const input = form.elements.namedItem('message') as HTMLInputElement
    const text = input.value.trim()
    if (!text || isLoading) return
    sendMessage({ text })
    input.value = ''
  }

  const suggestions = [
    '最近大V们怎么看A股走势？',
    '有哪些值得长期持有的股票？',
    '半导体板块最近有什么观点？',
  ]

  return (
    <section className="landing-section">
      <div className="landing-section-header">
        <Sparkles className="w-4 h-4 text-emerald-400" />
        <h2>AI 研究助手</h2>
        <span className="landing-section-tag">每日 {chatRemaining} 次</span>
      </div>
      <div className="landing-chat-container">
        {/* Messages area */}
        <div className="landing-chat-messages">
          {messages.length === 0 && !isLoading && (
            <div className="landing-chat-empty">
              <div className="landing-chat-empty-icon">
                <Logo className="text-emerald-400" size={28} />
              </div>
              <p className="text-sm text-neutral-400 mb-1">{systemSubtitle}</p>
              <p className="text-xs text-neutral-600 mb-6">基于大V观点的 RAG 智能问答</p>
              <div className="landing-suggestions">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage({ text: q })}
                    className="landing-suggestion-btn"
                  >
                    {q}
                    <ChevronRight className="w-3 h-3 flex-shrink-0 text-neutral-600" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            // 分离工具调用和文本
            const toolParts = msg.parts?.filter(p => isToolPart(p as Record<string, unknown>)) || []
            const textParts = msg.parts?.filter(p => p.type === 'text') || []

            return (
              <div key={msg.id} className={`landing-chat-msg ${isUser ? 'landing-chat-user' : 'landing-chat-ai'}`}>
                {/* 用户消息 */}
                {isUser && textParts.map((part, i) => (
                  <div key={i} className="landing-bubble-user">{(part as { text: string }).text}</div>
                ))}

                {/* AI 消息：工具调用 + 文本 */}
                {!isUser && (
                  <>
                    {toolParts.length > 0 && (
                      <div className="mb-1.5">
                        {toolParts.map((part, i) => (
                          <ToolCallCard key={i} part={part as Record<string, unknown>} />
                        ))}
                      </div>
                    )}
                    {textParts.map((part, i) => (
                      <div key={i} className="landing-bubble-ai">
                        <MarkdownMessage content={(part as { text: string }).text} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          })}

          {/* 加载态：思考中 / 搜索中 */}
          {isLoading && (() => {
            const last = messages[messages.length - 1]
            if (!last) return null
            // 刚发出消息，等待响应
            if (last.role === 'user') {
              return (
                <div className="landing-chat-msg landing-chat-ai">
                  <div className="landing-bubble-ai flex items-center gap-2 text-xs text-neutral-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="animate-pulse">思考中...</span>
                  </div>
                </div>
              )
            }
            // AI 正在调用工具
            if (last.role === 'assistant') {
              const hasRunningTool = last.parts?.some(
                p => isToolPart(p as Record<string, unknown>) &&
                     ((p as Record<string, unknown>).state === 'input-streaming' || (p as Record<string, unknown>).state === 'input-available')
              )
              if (hasRunningTool) {
                return (
                  <div className="landing-chat-msg landing-chat-ai">
                    <div className="landing-bubble-ai flex items-center gap-2 text-xs text-neutral-400">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                      <span className="animate-pulse">正在搜索信息...</span>
                    </div>
                  </div>
                )
              }
            }
            return null
          })()}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="landing-chat-input-area">
          <input
            name="message"
            placeholder="询问关于投资、市场、个股的问题..."
            disabled={isLoading}
            className="landing-chat-input"
          />
          <button type="submit" disabled={isLoading} className="landing-chat-send">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </section>
  )
}

/* ── Main Page ── */
export default function DashboardPage() {
  const [systemTitle, setSystemTitle] = useState('财经观点问答')
  const [systemSubtitle, setSystemSubtitle] = useState('基于大V观点数据库的 RAG 问答助手')
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>()
  const [ownerName, setOwnerName] = useState('')
  const [stats, setStats] = useState<{ total: number; articles: number; qa: number }>()
  const [summaryItems, setSummaryItems] = useState<DashboardSummaryItem[]>([])
  const [chatRemaining, setChatRemaining] = useState(0)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [enabledPlugins, setEnabledPlugins] = useState<PluginMeta[]>([])

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/dashboard/chat',
      headers: () => {
        const vid = getVisitorId()
        const h: Record<string, string> = {}
        if (vid) h['X-Visitor-Id'] = vid
        return h
      },
    }),
  })

  useEffect(() => {
    fetchSystemInfo()
      .then((data) => {
        setSystemTitle(data.system_title)
        setSystemSubtitle(data.system_subtitle)
        document.title = data.system_title
      })
      .catch(() => {})

    fetchSystemOwner()
      .then((data) => {
        if (data.avatar_url) setAvatarUrl(data.avatar_url)
        if (data.owner_name) setOwnerName(data.owner_name)
      })
      .catch(() => {})

    fetchDashboardStats()
      .then(setStats)
      .catch(() => {})

    fetchEnabledPlugins()
      .then((data) => setEnabledPlugins(data.plugins))
      .catch(() => {})

    fetchDashboardSummary(12)
      .then((data) => {
        setSummaryItems(data.items)
        setChatRemaining(data.chat_remaining)
      })
      .catch(() => {})
      .finally(() => setLoadingSummary(false))
  }, [])

  return (
    <div className="landing-root">
      {/* ── Sticky Nav ── */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="landing-nav-logo">
                <Logo className="text-emerald-400" size={18} />
              </div>
              <span className="text-sm font-semibold text-neutral-200 tracking-tight">
                {systemTitle}
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {enabledPlugins.map((plugin) => (
              <Link
                key={plugin.id}
                to={`/p/${plugin.id}`}
                className="px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-all"
              >
                {plugin.name}
              </Link>
            ))}
            <div className="ml-2 flex items-center gap-2 text-xs text-neutral-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              实时
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <HeroSection title={systemTitle} subtitle={systemSubtitle} avatarUrl={avatarUrl} ownerName={ownerName} stats={stats} />

      {/* ── 市场动态 ── */}
      <TimelineSection items={summaryItems} loading={loadingSummary} avatarUrl={avatarUrl} />

      {/* ── AI Assistant ── */}
      <ResearchAssistant
        messages={messages}
        status={status}
        chatRemaining={chatRemaining}
        systemSubtitle={systemSubtitle}
        sendMessage={sendMessage}
      />

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="flex items-center gap-2">
            <Logo className="text-neutral-600" size={16} />
            <span className="text-xs text-neutral-600">{systemTitle}</span>
          </div>
          <span className="text-xs text-neutral-700">AI 驱动</span>
        </div>
      </footer>
    </div>
  )
}
