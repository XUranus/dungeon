import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { HelpCircle, MessageCircle, FileText, Lightbulb, StickyNote, MessageSquare, ThumbsUp, Image as ImageIcon } from 'lucide-react'
import { fetchTopics, fetchComments, proxiedImageUrl } from '../services/api'
import { ImageGallery, QAContent, RichContent } from '../components/content'
import { parseQA } from '../utils/qa'
import type { Topic, Comment } from '../types'

const ITEM_HEIGHT = 112
const OVERSCAN = 8

const contentTypeLabel: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  'q&a': { icon: <HelpCircle size={12} />, label: '问答', color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' },
  'talk': { icon: <MessageCircle size={12} />, label: '发言', color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' },
  'article': { icon: <FileText size={12} />, label: '文章', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' },
  'answer': { icon: <MessageSquare size={12} />, label: '回答', color: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  'pin': { icon: <Lightbulb size={12} />, label: '想法', color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400' },
  'topic': { icon: <StickyNote size={12} />, label: '主题', color: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const platformName: Record<string, string> = {
  zsxq: '知识星球',
  Zsxq: '知识星球',
  zhihu: '知乎',
  Zhihu: '知乎',
  weibo: '微博',
  Weibo: '微博',
  wechat: '微信',
  Wechat: '微信',
  twitter: 'Twitter',
  Twitter: 'Twitter',
  x: 'X',
  douyin: '抖音',
}

const contentTypes = [
  { value: '', label: '全部类型', icon: null },
  { value: 'q&a', label: '问答', icon: <HelpCircle size={12} /> },
  { value: 'talk', label: '发言', icon: <MessageCircle size={12} /> },
  { value: 'article', label: '文章', icon: <FileText size={12} /> },
]

/** 时间范围快捷选项 */
const TIME_PRESETS = [
  { key: 'all', label: '全部', getRange: () => ({ from: '', to: '' }) },
  { key: '7d', label: '7天', getRange: () => ({ from: daysAgo(7), to: '' }) },
  { key: '30d', label: '30天', getRange: () => ({ from: daysAgo(30), to: '' }) },
  { key: '90d', label: '90天', getRange: () => ({ from: daysAgo(90), to: '' }) },
  { key: 'custom', label: '自定义', getRange: () => ({ from: '', to: '' }) },
]

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Strip HTML/markdown to plain text, truncate to maxLen */
function toPlainText(raw: string, maxLen = 80): string {
  const text = raw
    .replace(/<[^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length > maxLen) return text.slice(0, maxLen) + '...'
  return text
}

/** Extract question and answer summaries for Q&A content */
function qaSummary(content: string, maxLen = 80): { question: string; answer: string } {
  const parts = parseQA(content)
  const q = parts.find(p => p.type === 'question')
  const a = parts.find(p => p.type === 'answer')
  return {
    question: toPlainText(q?.text || '', maxLen),
    answer: toPlainText(a?.text || content, maxLen),
  }
}

/** From content extract plain text summary */
function plainSummary(content: string, contentType: string, maxLen = 80): string {
  if (contentType === 'q&a') {
    const { question } = qaSummary(content, maxLen)
    return question
  }
  return toPlainText(content, maxLen)
}

/* ── 主题详情（右侧完整展示）── */
function TopicDetail({ topic }: { topic: Topic }) {
  const hasImages = topic.images && topic.images.length > 0
  return (
    <div className="space-y-4">
      <div>
        {topic.title && (
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{topic.title}</h3>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          <span>{platformName[topic.platform] || topic.platform}</span>
          {topic.published_at && (
            <span>{new Date(topic.published_at).toLocaleString()}</span>
          )}
          {topic.url && (
            <a href={topic.url} target="_blank" rel="noopener noreferrer"
              className="text-neutral-600 dark:text-neutral-300 hover:underline">
              查看原文 ↗
            </a>
          )}
        </div>
      </div>
      {topic.content_type === 'q&a' ? (
        <QAContent content={topic.content} />
      ) : topic.content_type === 'talk' || topic.content_type === 'article' ? (
        <RichContent content={topic.content} />
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{topic.content}</p>
      )}
      {hasImages && <ImageGallery images={topic.images!} />}
      <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200/30 dark:border-gray-700/30">
        <span className="inline-flex items-center gap-1"><ThumbsUp size={12} /> {topic.like_count} 点赞</span>
        <span className="inline-flex items-center gap-1"><MessageCircle size={12} /> {topic.comment_count} 评论</span>
        {topic.images && topic.images.length > 0 && <span className="inline-flex items-center gap-1"><ImageIcon size={12} /> {topic.images.length} 图片</span>}
      </div>
    </div>
  )
}

/* ── 评论项 ── */
function CommentItem({ comment }: { comment: Comment }) {
  const hasImages = comment.images && comment.images.length > 0
  return (
    <div className="py-2.5 border-b border-gray-100/40 dark:border-gray-700/30 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-xs text-neutral-700 dark:text-neutral-300">
          {comment.author_name || '匿名'}
        </span>
        {comment.published_at && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {new Date(comment.published_at).toLocaleString()}
          </span>
        )}
      </div>
      <div className="text-gray-600 dark:text-gray-400 text-sm">
        <RichContent content={comment.content} />
      </div>
      {hasImages && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {comment.images!.map((img, i) => (
            <img key={img.image_id ?? i}
              src={proxiedImageUrl(img.thumbnail?.url || img.url || '', img.local_path || img.thumbnail?.local_path)}
              alt=""
              className="max-h-24 w-auto rounded-md border border-gray-200/50 dark:border-gray-600/30 cursor-pointer hover:opacity-80 transition-opacity" />
          ))}
        </div>
      )}
      {comment.like_count > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 inline-flex items-center gap-1">
          <ThumbsUp size={12} /> {comment.like_count}
        </span>
      )}
    </div>
  )
}

/* ── 左侧列表项 ── */
function TopicRow({ topic, isSelected, onClick }: {
  topic: Topic; isSelected: boolean; onClick: () => void
}) {
  const typeInfo = contentTypeLabel[topic.content_type] || contentTypeLabel.topic
  const isQA = topic.content_type === 'q&a'
  const qa = useMemo(
    () => isQA ? qaSummary(topic.content, 80) : null,
    [topic.content, isQA],
  )
  const summary = useMemo(
    () => plainSummary(topic.content, topic.content_type),
    [topic.content, topic.content_type],
  )
  return (
    <div
      onClick={onClick}
      style={{ height: ITEM_HEIGHT }}
      className={`box-border flex flex-col justify-center px-4 cursor-pointer transition-all duration-150 border-b border-gray-100/40 dark:border-gray-700/30 hover:bg-gray-50/60 dark:hover:bg-white/[0.03] ${
        isSelected
          ? 'bg-neutral-50 dark:bg-white/[0.06] border-l-[3px] border-l-neutral-500 dark:border-l-neutral-400'
          : 'border-l-[3px] border-l-transparent'
      }`}
    >
      <div className="flex items-center gap-2 min-h-[20px]">
        <span className={`text-[11px] px-1.5 py-0.5 rounded-md flex-shrink-0 inline-flex items-center gap-0.5 ${typeInfo.color}`}>
          {typeInfo.icon}{typeInfo.label}
        </span>
        {isQA ? (
          <span className="font-medium text-sm text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">
            {qa?.question || topic.title || '未命名提问'}
          </span>
        ) : topic.title ? (
          <span className="font-medium text-sm truncate text-gray-800 dark:text-gray-200 flex-1 min-w-0">{topic.title}</span>
        ) : <span className="flex-1 min-w-0" />}
        <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
          {topic.published_at ? new Date(topic.published_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : ''}
        </span>
      </div>
      {isQA ? (
        qa?.answer ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-1 line-clamp-2 overflow-hidden">
            {qa.answer}
          </p>
        ) : null
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-1 line-clamp-2 overflow-hidden">
          {summary}
        </p>
      )}
      <div className="flex items-center gap-2 mt-1.5 min-h-[18px]">
        {topic.images && topic.images.length > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {topic.images.slice(0, 3).map((img, i) => {
              const src = img.thumbnail?.url || img.url
              const lp = img.local_path || img.thumbnail?.local_path
              if (!src) return null
              return <img key={img.image_id ?? i} src={proxiedImageUrl(src, lp)} alt="" className="w-7 h-7 object-cover rounded border border-gray-200/50 dark:border-gray-600/30" />
            })}
          </div>
        )}
        <div className="flex gap-3 text-[11px] text-gray-400 dark:text-gray-500 ml-auto">
          <span className="inline-flex items-center gap-0.5"><ThumbsUp size={11} /> {topic.like_count}</span>
          <span className="inline-flex items-center gap-0.5"><MessageCircle size={11} /> {topic.comment_count}</span>
        </div>
      </div>
    </div>
  )
}

/* ── 主页面 ── */
export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState('')
  const [contentType, setContentType] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)

  // 时间范围
  const [timePreset, setTimePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showBackToTop, setShowBackToTop] = useState(false)

  // 虚拟滚动
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── 加载数据 ──
  const loadTopics = useCallback(async (p: number, opts?: { append?: boolean }) => {
    if (opts?.append) setLoadingMore(true)
    else setLoading(true)
    try {
      const res = await fetchTopics({
        page: p,
        page_size: 50,
        search: search || undefined,
        content_type: contentType || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      setTopics(prev => opts?.append ? [...prev, ...res.items] : res.items)
      setTotal(res.total)
      setHasMore(p * 50 < res.total)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [search, contentType, dateFrom, dateTo])

  // 筛选变化 → 重新加载
  useEffect(() => {
    setPage(1)
    setTopics([])
    loadTopics(1)
  }, [contentType, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // 容器高度
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setContainerHeight(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 无限加载
  useEffect(() => {
    const sentinel = sentinelRef.current
    const container = scrollRef.current
    if (!sentinel || !container) return
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        const nextPage = page + 1
        setPage(nextPage)
        loadTopics(nextPage, { append: true })
      }
    }, { root: container, rootMargin: '200px' })
    io.observe(sentinel)
    return () => io.disconnect()
  }, [page, hasMore, loadingMore, loading, loadTopics])

  // 滚动事件
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const st = scrollRef.current.scrollTop
      setScrollTop(st)
      setShowBackToTop(st > 400)
    }
  }, [])

  // 回到顶部
  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // 虚拟滚动计算
  const { visibleItems, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
    const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + OVERSCAN * 2
    const end = Math.min(topics.length, start + visibleCount)
    return { visibleItems: topics.slice(start, end), offsetY: start * ITEM_HEIGHT }
  }, [topics, scrollTop, containerHeight])

  // 搜索
  const handleSearch = () => {
    setPage(1)
    setTopics([])
    loadTopics(1)
  }

  // 选中主题
  const viewComments = async (topic: Topic) => {
    setSelectedTopic(topic)
    setCommentsLoading(true)
    try {
      setComments(await fetchComments(topic.id))
    } finally {
      setCommentsLoading(false)
    }
  }

  // 时间范围快捷按钮
  const handleTimePreset = (key: string) => {
    setTimePreset(key)
    if (key !== 'custom') {
      const r = TIME_PRESETS.find(p => p.key === key)!.getRange()
      setDateFrom(r.from)
      setDateTo(r.to)
    }
  }

  const totalHeight = topics.length * ITEM_HEIGHT

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── 顶栏 ── */}
      <div className="flex-shrink-0 px-6 py-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-gray-200/40 dark:border-gray-700/40 z-10">
        {/* 第一行：标题 + 搜索 + 搜索按钮 */}
        <div className="flex items-center gap-4 mb-2.5">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">数据浏览</h1>
          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">共 {total} 条</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索内容..."
            className="flex-1 min-w-0 glass-card dark:glass-card-dark rounded-lg px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600"
          />
          <button
            onClick={handleSearch}
            className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-1.5 rounded-lg text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all font-medium whitespace-nowrap"
          >
            搜索
          </button>
        </div>

        {/* 第二行：过滤器 */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 消息类型 */}
          <div className="flex items-center gap-0.5 glass-card dark:glass-card-dark rounded-lg p-0.5">
            {contentTypes.map(ct => (
              <button
                key={ct.value}
                onClick={() => { setContentType(ct.value); setPage(1) }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap inline-flex items-center gap-1 ${
                  contentType === ct.value
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-white/10'
                }`}
              >
                {ct.icon}{ct.label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

          {/* 时间范围快捷 */}
          <div className="flex items-center gap-0.5 glass-card dark:glass-card-dark rounded-lg p-0.5">
            {TIME_PRESETS.map(tp => (
              <button
                key={tp.key}
                onClick={() => handleTimePreset(tp.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  timePreset === tp.key
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-white/10'
                }`}
              >
                {tp.label}
              </button>
            ))}
          </div>

          {/* 自定义日期范围 */}
          {timePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="glass-card dark:glass-card-dark rounded-lg px-2.5 py-1 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600"
              />
              <span className="text-xs text-gray-400">至</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="glass-card dark:glass-card-dark rounded-lg px-2.5 py-1 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600"
              />
            </div>
          )}

          {/* 当前筛选摘要 */}
          {(contentType || dateFrom || dateTo) && (
            <button
              onClick={() => { setContentType(''); setDateFrom(''); setDateTo(''); setTimePreset('all') }}
              className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-auto"
            >
              ✕ 清除筛选
            </button>
          )}
        </div>
      </div>

      {/* ── 主体 ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧列表 */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="w-1/2 flex-shrink-0 overflow-y-auto border-r border-gray-200/40 dark:border-gray-700/40"
        >
          {loading && topics.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400 dark:text-gray-500 text-sm">加载中...</div>
            </div>
          ) : topics.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400 dark:text-gray-500 text-sm">暂无数据</div>
            </div>
          ) : (
            <>
              <div style={{ height: totalHeight, position: 'relative' }}>
                <div style={{ transform: `translateY(${offsetY}px)` }}>
                  {visibleItems.map((t) => (
                    <TopicRow
                      key={t.id}
                      topic={t}
                      isSelected={selectedTopic?.id === t.id}
                      onClick={() => viewComments(t)}
                    />
                  ))}
                </div>
              </div>
              <div ref={sentinelRef} className="h-1" />
              {loadingMore && (
                <div className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">加载更多...</div>
              )}
              {!hasMore && topics.length > 0 && (
                <div className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">— 已加载全部 {total} 条 —</div>
              )}
            </>
          )}
        </div>

        {/* 回到顶部按钮 */}
        <button
          onClick={scrollToTop}
          className={`absolute left-[calc(50%-52px)] bottom-6 z-20 w-9 h-9 rounded-full bg-neutral-900/80 dark:bg-white/80 text-white dark:text-neutral-900 shadow-lg backdrop-blur-sm flex items-center justify-center transition-all duration-300 hover:scale-110 ${
            showBackToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
          aria-label="回到顶部"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {/* 右侧详情 */}
        <div className="w-1/2 flex-shrink-0 overflow-y-auto">
          {selectedTopic ? (
            <div className="p-6">
              <div className="flex items-center justify-end mb-4">
                <button
                  onClick={() => setSelectedTopic(null)}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                  ✕ 关闭
                </button>
              </div>
              <TopicDetail topic={selectedTopic} />
              <div className="mt-6 pt-4 border-t border-gray-200/40 dark:border-gray-700/40">
                <h4 className="font-medium text-xs text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                  评论 ({comments.length})
                </h4>
                {commentsLoading ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">加载评论中...</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">暂无评论</p>
                ) : (
                  <div className="space-y-1">
                    {comments.map((c) => <CommentItem key={c.id} comment={c} />)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600">
              <svg className="w-16 h-16 mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">点击左侧消息查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
