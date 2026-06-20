import { useState, useEffect, useRef } from 'react'
import { RefreshCw, AlertCircle, CheckCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  fetchPlatforms,
  crawlAll,
  crawlPlatform,
  fetchCrawlTasks,
  startCrawlAsync,
  fetchCrawlStatus,
} from '../services/api'
import type { CrawlProgress } from '../services/api'
import type { CrawlTask } from '../types'

const platformLabel: Record<string, string> = {
  zhihu: '知乎',
  zsxq: '知识星球',
}

const isIdle = (s: CrawlProgress | { status: 'idle' }): s is { status: 'idle' } =>
  s.status === 'idle'

const PAGE_SIZE = 20

export default function SourcesPage() {
  const [platforms, setPlatforms] = useState<string[]>([])
  const [tasks, setTasks] = useState<CrawlTask[]>([])
  const [crawling, setCrawling] = useState<string | null>(null)
  const [asyncTask, setAsyncTask] = useState<CrawlProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [p, t] = await Promise.allSettled([fetchPlatforms(), fetchCrawlTasks()])
      if (p.status === 'fulfilled') setPlatforms(p.value.platforms)
      if (t.status === 'fulfilled') setTasks(t.value)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // 轮询异步任务状态
  const startPolling = () => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchCrawlStatus()
        if (isIdle(status)) {
          setAsyncTask(null)
          stopPolling()
          load()
        } else {
          setAsyncTask(status as CrawlProgress)
          if (status.status === 'done' || status.status === 'error') {
            stopPolling()
            setTimeout(() => { setAsyncTask(null); load() }, 3000)
          }
        }
      } catch {
        // 忽略轮询错误
      }
    }, 2000)
  }

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    fetchCrawlStatus().then((status) => {
      if (!isIdle(status)) {
        setAsyncTask(status as CrawlProgress)
        if (status.status === 'running') startPolling()
      }
    })
    return () => stopPolling()
  }, [])

  const isTaskRunning = asyncTask?.status === 'running' || !!crawling

  const handleCrawlAll = async () => {
    setCrawling('all')
    try {
      const results = await crawlAll()
      const summary = results
        .map((r) => `${platformLabel[r.platform] || r.platform}: +${r.topics_count}主题 +${r.comments_count}评论`)
        .join('\n')
      alert(`爬取完成！\n${summary}`)
      load()
    } catch (e: any) {
      alert(`爬取失败: ${e.message}`)
    } finally {
      setCrawling(null)
    }
  }

  const handleCrawlOne = async (platform: string) => {
    setCrawling(platform)
    try {
      const r = await crawlPlatform(platform)
      alert(`${platformLabel[platform]}爬取完成！+${r.topics_count}主题 +${r.comments_count}评论`)
      load()
    } catch (e: any) {
      alert(`爬取失败: ${e.message}`)
    } finally {
      setCrawling(null)
    }
  }

  const handleFullCrawl = async (platform: string) => {
    try {
      await startCrawlAsync(platform)
      startPolling()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const progressPercent = asyncTask
    ? asyncTask.progress.topics_found > 0
      ? Math.round((asyncTask.progress.topics_saved / asyncTask.progress.topics_found) * 100)
      : 0
    : 0

  // ---- 分页 ----
  const totalPages = Math.ceil(tasks.length / PAGE_SIZE)
  const pagedTasks = tasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">数据采集</h1>
        <button
          onClick={handleCrawlAll}
          disabled={isTaskRunning || platforms.length === 0}
          className="flex items-center gap-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-5 py-2.5 rounded-xl hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${crawling === 'all' ? 'animate-spin' : ''}`} />
          {crawling === 'all' ? '爬取中...' : '全部爬取'}
        </button>
      </div>

      {platforms.length === 0 && !loading && (
        <div className="glass-card dark:glass-card-dark border border-yellow-300/40 dark:border-yellow-600/30 rounded-xl p-3 mb-4 text-sm text-yellow-800 dark:text-yellow-300">
          ⚠️ 未配置任何平台。请在 config.json 中填写 zsxq_cookie / zsxq_group_id 或 zhihu_cookie / zhihu_url_token。
        </div>
      )}

      {/* 异步任务进度 */}
      {asyncTask && (
        <div className="glass-card dark:glass-card-dark rounded-xl p-5 mb-6 border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-3 mb-3">
            {asyncTask.status === 'running' ? (
              <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
            ) : asyncTask.status === 'done' ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500" />
            )}
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              {asyncTask.status === 'running'
                ? `正在爬取${platformLabel[asyncTask.platform] || asyncTask.platform}...`
                : asyncTask.status === 'done' ? '爬取完成！' : '爬取失败'}
            </span>
            {asyncTask.status === 'running' && (
              <span className="text-sm text-neutral-500 dark:text-neutral-400 ml-auto">{progressPercent}%</span>
            )}
          </div>

          {asyncTask.status === 'running' && (
            <div className="w-full bg-neutral-200/60 dark:bg-neutral-700/40 rounded-full h-2 mb-3 overflow-hidden">
              <div
                className="h-full bg-neutral-900 dark:bg-white rounded-full transition-all duration-500"
                style={{ width: `${Math.max(progressPercent, 2)}%` }}
              />
            </div>
          )}

          <div className="flex gap-6 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-neutral-700 dark:text-neutral-300">{asyncTask.progress.topics_found}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">发现主题</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-neutral-600 dark:text-neutral-400">{asyncTask.progress.topics_saved}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">已保存主题</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{asyncTask.progress.comments_saved}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">已保存评论</div>
            </div>
          </div>

          {asyncTask.error && <p className="text-red-500 dark:text-red-400 text-sm mt-2">{asyncTask.error}</p>}
        </div>
      )}

      {/* 平台卡片 */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {['zhihu', 'zsxq'].map((p) => {
          const enabled = platforms.includes(p)
          return (
            <div
              key={p}
              className={`rounded-xl p-4 transition-all ${
                enabled
                  ? 'glass-card dark:glass-card-dark'
                  : 'bg-white/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{platformLabel[p]}</span>
                <span className={`text-xs px-2 py-0.5 rounded-lg ${
                  enabled
                    ? 'bg-green-100/60 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                    : 'bg-neutral-100/60 dark:bg-neutral-800/40 text-neutral-400 dark:text-neutral-500'
                }`}>
                  {enabled ? '已配置' : '未配置'}
                </span>
              </div>
              {enabled && (
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => handleCrawlOne(p)}
                    disabled={isTaskRunning}
                    className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${crawling === p ? 'animate-spin' : ''}`} />
                    {crawling === p ? '爬取中...' : '增量爬取'}
                  </button>
                  <button
                    onClick={() => handleFullCrawl(p)}
                    disabled={isTaskRunning}
                    className="flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    全量爬取
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 爬取历史 - 表格 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
          爬取历史
          {tasks.length > 0 && <span className="text-xs font-normal text-neutral-400 ml-2">共 {tasks.length} 条</span>}
        </h2>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-neutral-500">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="glass-card dark:glass-card-dark rounded-xl p-8 text-center text-neutral-400 dark:text-neutral-500">
          暂无爬取记录
        </div>
      ) : (
        <div className="glass-card dark:glass-card-dark rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200/50 dark:border-neutral-700/50">
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">状态</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">平台</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">新增主题</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">新增评论</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">完成时间</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">错误信息</th>
              </tr>
            </thead>
            <tbody>
              {pagedTasks.map((t, i) => (
                <tr
                  key={t.id}
                  className={`border-b border-neutral-100/50 dark:border-neutral-800/50 last:border-0 ${
                    i % 2 === 0 ? '' : 'bg-neutral-50/50 dark:bg-neutral-800/20'
                  }`}
                >
                  <td className="px-4 py-3">
                    {t.status === 'done' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : t.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-800 dark:text-neutral-200">
                    {platformLabel[t.platform] || t.platform}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">
                    +{t.topics_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">
                    +{t.comments_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                    {t.finished_at
                      ? new Date(t.finished_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {t.error_message ? (
                      <span className="text-red-500 dark:text-red-400 text-xs truncate block max-w-[200px]" title={t.error_message}>
                        {t.error_message}
                      </span>
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-600">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
