import { useState, useEffect } from 'react'
import {
  TrendingUp, Globe, BookOpen, ChevronRight, Loader2,
} from 'lucide-react'
import DonutChart, { type DonutSegment } from '../../components/DonutChart'
import {
  fetchProfessorIndex,
  type ProfessorIndexData, type ProfessorIndexVersion, type ProfessorIndexSourceArticle,
} from '../../services/api'
import type { Plugin } from '../types'

const DONUT_COLORS = [
  '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
]

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

function SourceArticles({ articles }: { articles: ProfessorIndexSourceArticle[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <BookOpen className="w-3 h-3" />
        <span>参考文章 ({articles.length})</span>
        <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {articles.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span className="text-[10px] px-1 py-0.5 rounded bg-white/5 text-neutral-500 flex-shrink-0">
                {a.content_type === 'article' ? '文章' : 'Q&A'}
              </span>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="text-neutral-400 hover:text-emerald-400 transition-colors truncate">
                  {a.title || `文章 #${a.id}`}
                </a>
              ) : (
                <span className="text-neutral-500 truncate">{a.title || `文章 #${a.id}`}</span>
              )}
              {a.published_at && (
                <span className="text-neutral-600 flex-shrink-0 ml-auto">
                  {new Date(a.published_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 主页面 ── */
function ProfessorIndexPage() {
  const [data, setData] = useState<ProfessorIndexData>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProfessorIndex()
      .then(setData)
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

  const versions = ['内地版', '全球版'].filter(v => data[v])

  return (
    <div className="landing-plugin-page">
      <div className="landing-plugin-header">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h1 className="landing-plugin-title">教授指数</h1>
        <span className="landing-plugin-desc">持仓配置与资产分析</span>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-20">
          <TrendingUp className="w-10 h-10 mx-auto text-neutral-700 mb-4" />
          <p className="text-neutral-500">暂无教授指数数据</p>
        </div>
      ) : (
        <div className="landing-portfolio-grid">
          {versions.map((ver, vi) => {
            const snap = data[ver]!
            const segments = holdingsToSegments(snap)
            const hasWeights = segments.length > 0
            return (
              <div key={ver} className="landing-card landing-portfolio-card" style={{ animationDelay: `${vi * 100}ms` }}>
                <div className="landing-card-header">
                  <div className="flex items-center gap-2">
                    {ver === '内地版' ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <Globe className="w-4 h-4 text-blue-400" />}
                    <span className="landing-card-title">{ver}</span>
                  </div>
                  {snap.snapshot_at && (
                    <span className="text-xs text-neutral-600">
                      {new Date(snap.snapshot_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                {snap.notes && <p className="landing-portfolio-notes">{snap.notes}</p>}
                {snap.source_articles && snap.source_articles.length > 0 && <SourceArticles articles={snap.source_articles} />}
                {hasWeights ? (
                  <div className="landing-donut-wrapper">
                    <DonutChart segments={segments} size={180} strokeWidth={24} centerLabel="只标的" centerValue={String(segments.length)} />
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
      )}
    </div>
  )
}

const plugin: Plugin = {
  meta: {
    id: 'professor-index',
    name: '教授指数',
    icon: 'TrendingUp',
    description: '展示持仓配置（内地版/全球版），含环形图与参考文章。',
    order: 10,
  },
  component: ProfessorIndexPage,
}

export default plugin
