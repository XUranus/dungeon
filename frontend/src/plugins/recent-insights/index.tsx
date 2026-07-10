import { useState, useEffect } from 'react'
import {
  Loader2, ArrowUpRight, Heart, MessageSquare,
} from 'lucide-react'
import RichContent from '../../components/content/RichContent'
import { parseQA } from '../../utils/qa'
import { fetchDashboardSummary, type DashboardSummaryItem } from '../../services/api'
import type { Plugin } from '../types'

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

function RecentInsightsPage() {
  const [items, setItems] = useState<DashboardSummaryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardSummary(30)
      .then((data) => setItems(data.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="landing-plugin-page">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="landing-plugin-page">
      <div className="landing-plugin-header">
        <MessageSquare className="w-5 h-5 text-emerald-400" />
        <h1 className="landing-plugin-title">近期观点</h1>
        <span className="landing-plugin-desc">{items.length} 条动态</span>
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
    </div>
  )
}

const plugin: Plugin = {
  meta: {
    id: 'recent-insights',
    name: '近期观点',
    icon: 'MessageSquare',
    description: '展示最新市场动态时间线，支持多平台来源过滤',
    order: 20,
  },
  component: RecentInsightsPage,
}

export default plugin
