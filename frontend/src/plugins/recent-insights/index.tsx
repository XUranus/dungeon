import { useState, useEffect } from 'react'
import {
  Loader2, MessageSquare, Calendar, ExternalLink, ChevronDown,
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import {
  fetchInsightReports,
  type InsightReportItem,
} from '../../services/api'
import type { Plugin } from '../types'

const PLATFORM_LABELS: Record<string, string> = {
  zhihu: '知乎', xueqiu: '雪球', xiaohongshu: '小红书',
  weibo: '微博', douyin: '抖音', zsxq: '星球',
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

/* ── 报告卡片 ── */
function ReportCard({ report, expanded, onToggle }: {
  report: InsightReportItem
  expanded: boolean
  onToggle: () => void
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const startDate = formatDate(report.time_range_start)
  const endDate = formatDate(report.time_range_end)
  const generatedAgo = formatDate(report.generated_at)
  const sources = report.sources_json || []

  return (
    <div className="landing-card" style={{ padding: '16px 20px' }}>
      {/* 标题行 — 可点击折叠 */}
      <button onClick={onToggle} className="w-full text-left flex items-start gap-3 group">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
          <MessageSquare className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-200">观点总结</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              {report.topic_count} 条来源
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Calendar className="w-3 h-3 text-neutral-500" />
            <span className="text-xs text-neutral-400">{startDate} ~ {endDate}</span>
            {generatedAgo && (
              <span className="text-[10px] text-neutral-600">· {generatedAgo}生成</span>
            )}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-neutral-600 mt-2 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/5">
          {/* 报告正文 — Markdown 渲染 */}
          <div className="text-sm text-neutral-300 leading-relaxed prose prose-invert prose-sm max-w-none">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{report.content}</Markdown>
          </div>

          {/* 数据来源 — 默认折叠 */}
          {sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <button
                onClick={() => setSourcesOpen(!sourcesOpen)}
                className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} />
                数据来源 ({sources.length})
              </button>
              {sourcesOpen && (
                <div className="mt-2 space-y-1">
                  {sources.slice(0, 30).map((src) => (
                    <div key={src.id} className="flex items-center gap-2 text-xs">
                      <span className="text-[10px] px-1 py-0.5 rounded bg-white/5 text-neutral-500 flex-shrink-0">
                        {PLATFORM_LABELS[src.platform] || src.platform}
                      </span>
                      {src.url ? (
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-400 hover:text-emerald-400 transition-colors truncate flex items-center gap-0.5"
                        >
                          {src.title}
                          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />
                        </a>
                      ) : (
                        <span className="text-neutral-500 truncate">{src.title}</span>
                      )}
                      {src.published_at && (
                        <span className="text-neutral-600 flex-shrink-0 ml-auto">
                          {new Date(src.published_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  ))}
                  {sources.length > 30 && (
                    <div className="text-[10px] text-neutral-600">
                      ... 还有 {sources.length - 30} 条来源
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── 主页面 ── */
function RecentInsightsPage() {
  const [reports, setReports] = useState<InsightReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    fetchInsightReports(5)
      .then((data) => {
        setReports(data)
        // 默认展开最新一条
        if (data.length > 0) setExpandedId(data[0].id)
      })
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
        <span className="landing-plugin-desc">{reports.length} 份报告</span>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-20 text-neutral-500 text-sm">
          暂无观点总结报告，系统会定期自动生成
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              expanded={expandedId === report.id}
              onToggle={() => setExpandedId(expandedId === report.id ? null : report.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const plugin: Plugin = {
  meta: {
    id: 'recent-insights',
    name: '近期观点',
    icon: 'MessageSquare',
    description: '定期生成近期观点总结报告，按主题归纳大V观点并附带原文链接',
    order: 20,
  },
  component: RecentInsightsPage,
}

export default plugin
