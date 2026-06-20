import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Loader2, Send, TrendingUp, TrendingDown, Minus, Sparkles, Signal, Wifi, BatteryFull, ChevronUp, ChevronDown } from 'lucide-react'
import { MarkdownMessage } from '../components/chat/MarkdownMessage'
import {
  fetchSystemInfo,
  fetchDashboardSummary,
  fetchHoldings,
  type DashboardSummaryItem,
  type RecommendedHolding,
} from '../services/api'
import { getVisitorId } from '../utils/visitor'

/* ── Platform config ── */
const PLATFORM_LABELS: Record<string, string> = {
  zhihu: '知乎', xueqiu: '雪球', xiaohongshu: '小红书',
  weibo: '微博', douyin: '抖音', zsxq: '星球',
}
const PLATFORM_COLORS: Record<string, string> = {
  zhihu: '#3B82F6', xueqiu: '#F97316', xiaohongshu: '#EF4444',
  weibo: '#F43F5E', douyin: '#A3A3A3', zsxq: '#EAB308',
}
const SENTIMENT_CONFIG = {
  bullish: { label: '看多', color: '#22C55E', icon: TrendingUp },
  bearish: { label: '看空', color: '#EF4444', icon: TrendingDown },
  neutral: { label: '中性', color: '#A3A3A3', icon: Minus },
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

/* ── Auto-scrolling ticker ── */
function ScrollTicker({ items }: { items: DashboardSummaryItem[] }) {
  const [paused, setPaused] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    if (items.length <= 1 || paused) return
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length)
    }, 3500)
    return () => clearInterval(intervalRef.current)
  }, [items.length, paused])

  const handlePrev = () => { setPaused(true); setCurrentIndex((p) => (p - 1 + items.length) % items.length) }
  const handleNext = () => { setPaused(true); setCurrentIndex((p) => (p + 1) % items.length) }

  if (items.length === 0) return null

  const visible = [
    items[currentIndex % items.length],
    items[(currentIndex + 1) % items.length],
    items[(currentIndex + 2) % items.length],
  ]

  return (
    <div
      className="relative h-full flex flex-col"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Nav arrows */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <button
          onClick={handlePrev}
          className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
        </button>
        <button
          onClick={handleNext}
          className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-3 overflow-hidden">
        {visible.map((item, i) => {
          const platColor = PLATFORM_COLORS[item.platform] || '#A3A3A3'
          return (
            <div
              key={`${item.id}-${currentIndex}-${i}`}
              className="rounded-xl p-4 transition-all duration-500 ease-out cursor-pointer hover:scale-[1.01]"
              style={{
                background: `linear-gradient(135deg, ${platColor}08, ${platColor}04)`,
                border: `1px solid ${platColor}20`,
                opacity: i === 0 ? 1 : i === 1 ? 0.75 : 0.5,
                transform: `scale(${1 - i * 0.02})`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${platColor}20`, color: platColor }}
                >
                  {PLATFORM_LABELS[item.platform] || item.platform}
                </span>
                {item.title && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate flex-1">
                    {item.title}
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-300 dark:text-neutral-300 line-clamp-3 leading-relaxed">
                {item.content_preview}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                {item.like_count > 0 && <span>👍 {item.like_count}</span>}
                <span>{formatDate(item.published_at)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-1.5 mt-3">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => { setPaused(true); setCurrentIndex(i) }}
            className="w-1.5 h-1.5 rounded-full transition-all duration-300"
            style={{
              background: i === currentIndex ? '#D4A853' : '#3A3A3A',
              transform: i === currentIndex ? 'scale(1.3)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Phone Chat Mockup ── */
function PhoneChat({
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

  return (
    <div className="phone-frame">
      <div className="phone-notch" />
      <div className="phone-statusbar">
        <span className="text-xs font-medium">9:41</span>
        <div className="flex items-center gap-1">
          <Signal className="w-3 h-3" />
          <Wifi className="w-3 h-3" />
          <BatteryFull className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Chat header */}
      <div className="phone-header">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-100">AI 助手</div>
            <div className="text-xs text-green-400">在线</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="phone-messages">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-amber-500" />
            </div>
            <p className="text-sm text-neutral-400 mb-1">{systemSubtitle}</p>
            <p className="text-xs text-neutral-500 mb-4">每日 {chatRemaining} 次免费问答</p>
            <div className="space-y-2 w-full">
              {['最近大V们怎么看A股走势？', '有哪些值得长期持有的股票？', '半导体板块最近有什么观点？'].map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage({ text: q })}
                  className="w-full text-left text-xs text-neutral-400 bg-white/5 hover:bg-white/10 rounded-xl px-4 py-2.5 transition-colors border border-white/5"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
            <div className="max-w-[82%]">
              {msg.parts?.map((part, i) => {
                if (part.type === 'text') {
                  return msg.role === 'user' ? (
                    <div key={i} className="phone-bubble-user">{part.text}</div>
                  ) : (
                    <div key={i} className="phone-bubble-ai">
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
                    <div key={i} className="phone-tool-card">
                      {ti.state === 'call' && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>{toolLabels[toolName] || toolName}</span>
                      {ti.state === 'result' && <span className="text-green-400">✓</span>}
                    </div>
                  )
                }
                return null
              })}
            </div>
          </div>
        ))}

        {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start mb-2">
            <div className="phone-bubble-ai flex items-center gap-2">
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
      <form onSubmit={handleSend} className="phone-input-area">
        <input
          name="message"
          placeholder="输入你的问题..."
          disabled={isLoading}
          className="phone-input"
        />
        <button type="submit" disabled={isLoading} className="phone-send-btn">
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Home indicator */}
      <div className="phone-home-indicator">
        <div className="w-32 h-1 rounded-full bg-neutral-600" />
      </div>
    </div>
  )
}

/* ── Main Page ── */
export default function DashboardPage() {
  const [systemTitle, setSystemTitle] = useState('财经观点问答')
  const [systemSubtitle, setSystemSubtitle] = useState('基于大V观点数据库的 RAG 问答助手')
  const [summaryItems, setSummaryItems] = useState<DashboardSummaryItem[]>([])
  const [holdings, setHoldings] = useState<RecommendedHolding[]>([])
  const [chatRemaining, setChatRemaining] = useState(0)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingHoldings, setLoadingHoldings] = useState(true)

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

    fetchDashboardSummary(10)
      .then((data) => {
        setSummaryItems(data.items)
        setChatRemaining(data.chat_remaining)
      })
      .catch(() => {})
      .finally(() => setLoadingSummary(false))

    fetchHoldings()
      .then(setHoldings)
      .catch(() => {})
      .finally(() => setLoadingHoldings(false))
  }, [])

  return (
    <div className="dashboard-root">
      {/* ── Background grid ── */}
      <div className="dashboard-grid-bg" />

      {/* ── Header ── */}
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-100">
                {systemTitle}
              </h1>
              <p className="text-xs text-neutral-500">{systemSubtitle}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-500">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            实时更新
          </div>
        </div>
      </header>

      {/* ── Holdings Banner ── */}
      {!loadingHoldings && holdings.length > 0 && (
        <div className="dashboard-holdings">
          <div className="dashboard-holdings-inner">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                AI 推荐持仓
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {holdings.slice(0, 8).map((h) => {
                const cfg = SENTIMENT_CONFIG[h.sentiment] || SENTIMENT_CONFIG.neutral
                const Icon = cfg.icon
                return (
                  <div key={h.id} className="holding-chip flex-shrink-0" style={{ borderColor: `${cfg.color}30` }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-neutral-100">{h.stock_name}</span>
                      <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{h.reason}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Grid ── */}
      <div className="dashboard-main">
        {/* Left: Latest Updates */}
        <aside className="updates-panel">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full bg-amber-500" />
            <h2 className="text-sm font-bold text-neutral-200 tracking-wide uppercase">最新动态</h2>
            <span className="text-xs text-neutral-600 ml-auto">{summaryItems.length} 条</span>
          </div>

          {loadingSummary ? (
            <div className="flex items-center justify-center py-12 text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <ScrollTicker items={summaryItems} />
          )}
        </aside>

        {/* Right: Phone Chat */}
        <div className="chat-panel">
          <PhoneChat
            messages={messages}
            status={status}
            chatRemaining={chatRemaining}
            systemSubtitle={systemSubtitle}
            sendMessage={sendMessage}
          />
        </div>
      </div>
    </div>
  )
}
