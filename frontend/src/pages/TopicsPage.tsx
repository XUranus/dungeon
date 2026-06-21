import { useState, useEffect } from 'react'
import { fetchTopics, fetchComments, proxiedImageUrl } from '../services/api'
import { ImageGallery, QAContent, RichContent } from '../components/content'
import type { Topic, Comment } from '../types'

const contentTypeLabel: Record<string, { icon: string; label: string; color: string }> = {
  'q&a': { icon: '❓', label: '问答', color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' },
  'talk': { icon: '💬', label: '发言', color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' },
  'article': { icon: '📄', label: '文章', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' },
  'answer': { icon: '💬', label: '回答', color: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  'pin': { icon: '💡', label: '想法', color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400' },
  'topic': { icon: '📝', label: '主题', color: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const contentTypes = [
  { value: '', label: '全部类型' },
  { value: 'q&a', label: '❓ 问答' },
  { value: 'talk', label: '💬 发言' },
  { value: 'article', label: '📄 文章' },
]

function getTopicPreview(t: Topic): React.ReactNode {
  const hasImages = t.images && t.images.length > 0

  if (t.content_type === 'q&a') {
    return (
      <>
        <QAContent content={t.content} compact />
        {hasImages && <ImageThumbnails images={t.images!} />}
      </>
    )
  }

  if (t.content_type === 'talk' || t.content_type === 'article') {
    return (
      <>
        <RichContent content={t.content} compact />
        {hasImages && <ImageThumbnails images={t.images!} />}
      </>
    )
  }

  return (
    <>
      <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
        <RichContent content={t.content} compact />
      </div>
      {hasImages && <ImageThumbnails images={t.images!} />}
    </>
  )
}

function ImageThumbnails({ images }: { images: { image_id?: number; thumbnail?: { url: string }; url?: string }[] }) {
  return (
    <div className="flex gap-1.5 mt-2">
      {images.slice(0, 3).map((img, i) => {
        const src = img.thumbnail?.url || img.url
        if (!src) return null
        return (
          <img
            key={img.image_id ?? i}
            src={proxiedImageUrl(src)}
            alt=""
            className="w-12 h-12 object-cover rounded-md border border-gray-200/50 dark:border-gray-600/30"
          />
        )
      })}
      {images.length > 3 && (
        <span className="w-12 h-12 flex items-center justify-center rounded-md bg-gray-100/80 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400">
          +{images.length - 3}
        </span>
      )}
    </div>
  )
}

function TopicDetail({ topic }: { topic: Topic }) {
  const hasImages = topic.images && topic.images.length > 0

  return (
    <div className="space-y-4">
      {/* Title & Meta */}
      <div>
        {topic.title && (
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{topic.title}</h3>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          <span className="capitalize">{topic.platform}</span>
          {topic.published_at && (
            <span>{new Date(topic.published_at).toLocaleString()}</span>
          )}
          {topic.url && (
            <a
              href={topic.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-600 dark:text-neutral-300 hover:underline"
            >
              查看原文 ↗
            </a>
          )}
        </div>
      </div>

      {/* Content by type */}
      {topic.content_type === 'q&a' ? (
        <QAContent content={topic.content} />
      ) : topic.content_type === 'talk' || topic.content_type === 'article' ? (
        <RichContent content={topic.content} />
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{topic.content}</p>
      )}

      {/* Images */}
      {hasImages && <ImageGallery images={topic.images!} />}

      {/* Stats */}
      <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200/30 dark:border-gray-700/30">
        <span>👍 {topic.like_count} 点赞</span>
        <span>💬 {topic.comment_count} 评论</span>
        {topic.images && topic.images.length > 0 && <span>🖼️ {topic.images.length} 图片</span>}
      </div>
    </div>
  )
}

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
            <img
              key={img.image_id ?? i}
              src={proxiedImageUrl(img.thumbnail?.url || img.url || '')}
              alt=""
              className="max-h-24 w-auto rounded-md border border-gray-200/50 dark:border-gray-600/30 cursor-pointer hover:opacity-80 transition-opacity"
            />
          ))}
        </div>
      )}
      {comment.like_count > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 inline-block">
          👍 {comment.like_count}
        </span>
      )}
    </div>
  )
}

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [contentType, setContentType] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [comments, setComments] = useState<Comment[]>([])

  const load = async (p: number, q?: string, ct?: string) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = { page: p }
      if (q) params.search = q
      if (ct) params.content_type = ct
      const res = await fetchTopics(params)
      setTopics(res.items)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(page, search || undefined, contentType || undefined) }, [page, contentType])

  const handleSearch = () => {
    setPage(1)
    load(1, search || undefined, contentType || undefined)
  }

  const viewComments = async (topic: Topic) => {
    setSelectedTopic(topic)
    const cs = await fetchComments(topic.id)
    setComments(cs)
  }

  return (
    <div className="p-6 max-w-7xl">
      <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-gray-100">数据浏览</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">共 {total} 条数据</p>

      {/* 搜索 & 筛选 */}
      <div className="flex gap-2 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索内容..."
          className="flex-1 glass-card dark:glass-card-dark rounded-xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600"
        />
        <select
          value={contentType}
          onChange={(e) => { setContentType(e.target.value); setPage(1) }}
          className="glass-card dark:glass-card-dark rounded-xl px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M7 7l3-3 3 3m0 6l-3 3-3-3'/%3E%3C/svg%3E")` }}
        >
          {contentTypes.map(ct => (
            <option key={ct.value} value={ct.value}>{ct.label}</option>
          ))}
        </select>
        <button
          onClick={handleSearch}
          className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-5 py-2.5 rounded-xl text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all font-medium"
        >
          搜索
        </button>
      </div>

      <div className="flex gap-6">
        {/* 主题列表 */}
        <div className={`space-y-3 min-w-0 ${selectedTopic ? 'flex-1' : 'max-w-3xl'}`}>
          {loading ? (
            <p className="text-gray-400 dark:text-gray-500">加载中...</p>
          ) : topics.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-center py-12">暂无数据</p>
          ) : (
            topics.map((t) => {
              const typeInfo = contentTypeLabel[t.content_type] || contentTypeLabel.topic
              return (
                <div
                  key={t.id}
                  onClick={() => viewComments(t)}
                  className={`glass-card dark:glass-card-dark rounded-xl p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                    selectedTopic?.id === t.id
                      ? 'ring-2 ring-neutral-400/60 shadow-lg'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-lg ${typeInfo.color}`}>
                      {typeInfo.icon} {typeInfo.label}
                    </span>
                    {t.title && (
                      <span className="font-medium text-sm truncate text-gray-800 dark:text-gray-200">{t.title}</span>
                    )}
                  </div>
                  {getTopicPreview(t)}
                  <div className="flex gap-4 mt-3 text-xs text-gray-400 dark:text-gray-500">
                    <span>👍 {t.like_count}</span>
                    <span>💬 {t.comment_count}</span>
                    {t.images && t.images.length > 0 && <span>🖼️ {t.images.length}</span>}
                    {t.published_at && (
                      <span>{new Date(t.published_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              )
            })
          )}

          {/* 分页 */}
          {total > 20 && (
            <div className="flex justify-center gap-2 pt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="glass-card dark:glass-card-dark px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 text-gray-700 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10 transition-all"
              >
                上一页
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                {page} / {Math.ceil(total / 20)}
              </span>
              <button
                disabled={page * 20 >= total}
                onClick={() => setPage(page + 1)}
                className="glass-card dark:glass-card-dark px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 text-gray-700 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10 transition-all"
              >
                下一页
              </button>
            </div>
          )}
        </div>

        {/* 详情侧栏 */}
        {selectedTopic && (
          <div className="w-96 glass-card dark:glass-card-dark rounded-xl p-5 h-fit sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                主题详情
              </h3>
              <button
                onClick={() => setSelectedTopic(null)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <TopicDetail topic={selectedTopic} />

            {/* 评论区 */}
            <div className="mt-6 pt-4 border-t border-gray-200/40 dark:border-gray-700/40">
              <h4 className="font-medium text-xs text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                评论 ({comments.length})
              </h4>
              {comments.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">暂无评论</p>
              ) : (
                <div className="space-y-1">
                  {comments.map((c) => (
                    <CommentItem key={c.id} comment={c} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
