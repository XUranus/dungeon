import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import {
  Loader2, Send, ArrowUpRight, Heart, MessageSquare,
  TrendingUp, Globe, Sparkles, ChevronRight,
} from 'lucide-react'
import Logo from '../components/Logo'
import { MarkdownMessage } from '../components/chat/MarkdownMessage'
import RichContent from '../components/content/RichContent'
import DonutChart, { type DonutSegment } from '../components/DonutChart'
import { parseQA } from '../utils/qa'
import {
  fetchSystemInfo,
  fetchDashboardSummary,
  fetchProfessorIndex,
  type DashboardSummaryItem,
  type ProfessorIndexData,
  type ProfessorIndexVersion,
} from '../services/api'
import { getVisitorId } from '../utils/visitor'

/* ── Platform config ── */
const PLATFORM_LABELS: Record<string, string> = {
  zhihu: '知乎', xueqiu: '雪球', xiaohongshu: '小红书',
  weibo: '微博', douyin: '抖音', zsxq: '星球',
}
const PLATFORM_ICONS: Record<string, string> = {
  zhihu: '知', xueqiu: '雪', xiaohongshu: '红',
  weibo: '微', douyin: '抖', zsxq: '星',
}
const PLATFORM_COLORS: Record<string, string> = {
  zhihu: '#3B82F6', xueqiu: '#F97316', xiaohongshu: '#EF4444',
  weibo: '#F43F5E', douyin: '#A3A3A3', zsxq: '#10B981',
}

/* ── Donut color palette ── */
const DONUT_COLORS = [
  '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
]

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

function holdingsToSegments(data: ProfessorIndexVersion): DonutSegment[] {
  return data.holdings
    .filter(h => h.weight != null && h.weight > 0)
    .map((h, i) => ({
      label: h.name,
      value: h.weight!,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
      code: h.code,
      market: h.market,
    }))
}

/* ── Hero Section ── */
function HeroSection({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="landing-hero">
      <div className="landing-hero-glow" />
      <div className="landing-hero-content">
        <div className="landing-hero-badge">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI 驱动的智能投资研究</span>
        </div>
        <h1 className="landing-hero-title">{title}</h1>
        <p className="landing-hero-subtitle">{subtitle}</p>
      </div>
    </section>
  )
}

/* ── Portfolio Section (Professor Index) ── */
function PortfolioSection({ data }: { data: ProfessorIndexData }) {
  const versions = ['内地版', '全球版'].filter(v => data[v])
  if (versions.length === 0) return null

  return (
    <section className="landing-section">
      <div className="landing-section-header">
        <TrendingUp className="w-4 h-4 text-emerald-400" />
        <h2>持仓配置</h2>
        <span className="landing-section-tag">教授指数</span>
      </div>
      <div className="landing-portfolio-grid">
        {versions.map((ver, vi) => {
          const snap = data[ver]!
          const segments = holdingsToSegments(snap)
          const hasWeights = segments.length > 0
          return (
            <div
              key={ver}
              className="landing-card landing-portfolio-card"
              style={{ animationDelay: `${vi * 100}ms` }}
            >
              <div className="landing-card-header">
                <div className="flex items-center gap-2">
                  {ver === '内地版' ? (
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Globe className="w-4 h-4 text-blue-400" />
                  )}
                  <span className="landing-card-title">{ver}</span>
                </div>
                {snap.snapshot_at && (
                  <span className="text-xs text-neutral-600">
                    {new Date(snap.snapshot_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>

              {snap.notes && (
                <p className="landing-portfolio-notes">{snap.notes}</p>
              )}

              {hasWeights ? (
                <div className="landing-donut-wrapper">
                  <DonutChart
                    segments={segments}
                    size={180}
                    strokeWidth={24}
                    centerLabel="只标的"
                    centerValue={String(segments.length)}
                  />
                </div>
              ) : (
                <div className="landing-holdings-plain">
                  {snap.holdings.map((h, i) => (
                    <div key={i} className="landing-holding-chip">
                      <span className="landing-holding-name">{h.name}</span>
                      {h.code && <span className="landing-holding-code">{h.code}</span>}
                      <span className="landing-holding-market">{h.market}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── 市场动态时间线 ── */
function TimelineSection({ items, loading }: { items: DashboardSummaryItem[]; loading: boolean }) {
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
                  <span
                    className="landing-platform-badge"
                    style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
                  >
                    {PLATFORM_ICONS[item.platform] || '?'}
                  </span>
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
                    </div>
                    {item.title && (
                      <p className="text-sm text-neutral-300 truncate mt-0.5">{item.title}</p>
                    )}
                  </div>
                  <span className="text-xs text-neutral-600 flex-shrink-0 ml-2">
                    {formatDate(item.published_at)}
                  </span>
                </div>

                {isQA && qaParts && qaParts.length > 0 ? (
                  <div className="landing-insight-qa">
                    {qaParts.slice(0, 2).map((part, pi) => (
                      <div key={pi} className="landing-insight-qa-part">
                        <span className="text-[10px] text-neutral-500 font-medium">
                          {part.type === 'question' ? '提问' : '回答'}
                        </span>
                        <div className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                          <RichContent content={part.text} compact />
                        </div>
                      </div>
                    ))}
                  </div>
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

          {messages.map((msg) => (
            <div key={msg.id} className={`landing-chat-msg ${msg.role === 'user' ? 'landing-chat-user' : 'landing-chat-ai'}`}>
              {msg.parts?.map((part, i) => {
                if (part.type === 'text') {
                  return msg.role === 'user' ? (
                    <div key={i} className="landing-bubble-user">{part.text}</div>
                  ) : (
                    <div key={i} className="landing-bubble-ai">
                      <MarkdownMessage content={part.text} />
                    </div>
                  )
                }
                if (part.type === 'tool-invocation') {
                  const ti = (part as Record<string, unknown>).toolInvocation as Record<string, unknown> | undefined
                  if (!ti) return null
                  const toolLabels: Record<string, string> = {
                    web_search: '网络搜索', get_stock_quote: '股票行情', get_market_overview: '市场概况',
                  }
                  const toolName = String(ti.toolName || '')
                  return (
                    <div key={i} className="landing-tool-card">
                      {ti.state === 'call' && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>{toolLabels[toolName] || toolName}</span>
                      {ti.state === 'result' && <span className="text-emerald-400">✓</span>}
                    </div>
                  )
                }
                return null
              })}
            </div>
          ))}

          {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
            <div className="landing-chat-msg landing-chat-ai">
              <div className="landing-bubble-ai flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
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
  const [summaryItems, setSummaryItems] = useState<DashboardSummaryItem[]>([])
  const [professorIndex, setProfessorIndex] = useState<ProfessorIndexData>({})
  const [chatRemaining, setChatRemaining] = useState(0)
  const [loadingSummary, setLoadingSummary] = useState(true)

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

    fetchDashboardSummary(12)
      .then((data) => {
        setSummaryItems(data.items)
        setChatRemaining(data.chat_remaining)
      })
      .catch(() => {})
      .finally(() => setLoadingSummary(false))

    fetchProfessorIndex()
      .then(setProfessorIndex)
      .catch(() => {})
  }, [])

  return (
    <div className="landing-root">
      {/* ── Sticky Nav ── */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="flex items-center gap-3">
            <div className="landing-nav-logo">
              <Logo className="text-emerald-400" size={18} />
            </div>
            <span className="text-sm font-semibold text-neutral-200 tracking-tight">
              {systemTitle}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            实时
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <HeroSection title={systemTitle} subtitle={systemSubtitle} />

      {/* ── Portfolio ── */}
      {Object.keys(professorIndex).length > 0 && (
        <PortfolioSection data={professorIndex} />
      )}

      {/* ── 市场动态 ── */}
      <TimelineSection items={summaryItems} loading={loadingSummary} />

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
