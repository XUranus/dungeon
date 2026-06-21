import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Check, Settings, Database, Bot, Activity, Sparkles, Wrench, Key, Globe, TrendingUp, BarChart3 } from 'lucide-react'
import {
  fetchCrawlInterval, updateCrawlInterval, type CrawlIntervalResponse,
  fetchSystemInfo, updateSystemInfo, type SystemInfo,
  fetchToolsSettings, updateToolsSettings, type ToolsSettings,
  fetchLogLevel, updateLogLevel,
  startProfessorIndexParse, fetchProfessorIndexParseStatus, fetchProfessorIndexParseHistory,
  fetchProfessorIndexInterval, updateProfessorIndexInterval,
  type ParseTask,
} from '../services/api'

const INTERVAL_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 1, label: '每 1 分钟' },
  { value: 30, label: '每 30 分钟' },
  { value: 60, label: '每 1 小时' },
]

const PI_INTERVAL_OPTIONS = [
  { value: 1, label: '每 1 天' },
  { value: 7, label: '每 7 天' },
  { value: 15, label: '每 15 天' },
  { value: 30, label: '每 30 天' },
]

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  done: '已完成',
  error: '失败',
}

const TABS = [
  { key: 'basic', label: '基础', icon: Settings },
  { key: 'crawl', label: '采集', icon: Database },
  { key: 'tools', label: '工具', icon: Bot },
  { key: 'holdings', label: '持仓', icon: Activity },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('basic')

  // ---- System info ----
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [sysSaving, setSysSaving] = useState(false)
  const [sysSaved, setSysSaved] = useState(false)

  // ---- Crawl interval ----
  const [crawlInterval, setCrawlInterval] = useState<CrawlIntervalResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // ---- Tools settings ----
  const [toolsSettings, setToolsSettings] = useState<ToolsSettings | null>(null)
  const [tavilyKeyInput, setTavilyKeyInput] = useState('')
  const [toolsSaving, setToolsSaving] = useState(false)
  const [toolsSaved, setToolsSaved] = useState(false)

  // ---- Log level ----
  const [logLevel, setLogLevel] = useState<string>('INFO')
  const [logSaving, setLogSaving] = useState(false)
  const [logSaved, setLogSaved] = useState(false)

  // ---- Professor Index ----
  const [piInterval, setPiInterval] = useState(7)
  const [piIntervalSaving, setPiIntervalSaving] = useState(false)
  const [piIntervalSaved, setPiIntervalSaved] = useState(false)
  const [piParsing, setPiParsing] = useState(false)
  const [piStatus, setPiStatus] = useState<ParseTask | null>(null)
  const [piHistory, setPiHistory] = useState<ParseTask[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadPiHistory = useCallback(async () => {
    try {
      const history = await fetchProfessorIndexParseHistory()
      setPiHistory(history)
    } catch { /* ignore */ }
  }, [])

  const loadPiStatus = useCallback(async () => {
    try {
      const s = await fetchProfessorIndexParseStatus()
      if ('status' in s && s.status !== 'idle') {
        setPiStatus(s as ParseTask)
        return s as ParseTask
      }
      setPiStatus(null)
      return null
    } catch { return null }
  }, [])

  // 轮询状态
  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      const s = await loadPiStatus()
      if (s && s.status !== 'pending' && s.status !== 'running') {
        stopPolling()
        setPiParsing(false)
        loadPiHistory()
      }
    }, 3000)
  }, [loadPiStatus, loadPiHistory])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetchSystemInfo().then(setSysInfo),
      fetchCrawlInterval().then(setCrawlInterval),
      fetchToolsSettings().then(setToolsSettings),
      fetchLogLevel().then((res) => setLogLevel(res.level)),
      fetchProfessorIndexInterval().then((res) => setPiInterval(res.interval_days)),
      loadPiStatus(),
      loadPiHistory(),
    ]).finally(() => { setLoading(false) })
    return () => { stopPolling() }
  }, [loadPiStatus, loadPiHistory, stopPolling])

  // ── Handlers ──

  const handleSystemInfoSave = async () => {
    if (!sysInfo) return
    setSysSaving(true)
    setSysSaved(false)
    try {
      const res = await updateSystemInfo(sysInfo)
      setSysInfo(res)
      setSysSaved(true)
      setTimeout(() => setSysSaved(false), 2000)
    } catch { /* ignore */ } finally { setSysSaving(false) }
  }

  const handleIntervalChange = async (minutes: number) => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await updateCrawlInterval(minutes)
      setCrawlInterval(res)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  const handleToolsToggle = async () => {
    if (!toolsSettings) return
    setToolsSaving(true)
    setToolsSaved(false)
    try {
      const res = await updateToolsSettings({ enable_tools: !toolsSettings.enable_tools })
      setToolsSettings(res)
      setToolsSaved(true)
      setTimeout(() => setToolsSaved(false), 2000)
    } catch { /* ignore */ } finally { setToolsSaving(false) }
  }

  const handleTavilyKeySave = async () => {
    if (!tavilyKeyInput.trim()) return
    setToolsSaving(true)
    setToolsSaved(false)
    try {
      const res = await updateToolsSettings({ tavily_api_key: tavilyKeyInput.trim() })
      setToolsSettings(res)
      setTavilyKeyInput('')
      setToolsSaved(true)
      setTimeout(() => setToolsSaved(false), 2000)
    } catch { /* ignore */ } finally { setToolsSaving(false) }
  }

  const handleLogLevelChange = async (level: string) => {
    setLogSaving(true)
    setLogSaved(false)
    try {
      const res = await updateLogLevel(level)
      setLogLevel(res.level)
      setLogSaved(true)
      setTimeout(() => setLogSaved(false), 2000)
    } catch { /* ignore */ } finally { setLogSaving(false) }
  }

  const handlePiIntervalChange = async (days: number) => {
    setPiIntervalSaving(true)
    setPiIntervalSaved(false)
    try {
      const res = await updateProfessorIndexInterval(days)
      setPiInterval(res.interval_days)
      setPiIntervalSaved(true)
      setTimeout(() => setPiIntervalSaved(false), 2000)
    } catch { /* ignore */ } finally { setPiIntervalSaving(false) }
  }

  const handleParseProfessorIndex = async () => {
    setPiParsing(true)
    try {
      await startProfessorIndexParse()
      startPolling()
    } catch (e) {
      const msg = (e as Error)?.message || ''
      if (msg.includes('409')) {
        // 已有任务在运行，开始轮询
        startPolling()
      } else {
        setPiParsing(false)
      }
    }
  }

  // ── Tab Content ──

  const renderBasic = () => (
    <div className="space-y-6">
      {/* 系统名称 */}
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200">系统名称</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          自定义公共大屏和管理后台显示的名称
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : sysInfo && (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">主标题</label>
                <input
                  value={sysInfo.system_title}
                  onChange={(e) => setSysInfo({ ...sysInfo, system_title: e.target.value })}
                  maxLength={50}
                  className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
                  placeholder="大V观点分析"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">副标题</label>
                <input
                  value={sysInfo.system_subtitle}
                  onChange={(e) => setSysInfo({ ...sysInfo, system_subtitle: e.target.value })}
                  maxLength={100}
                  className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
                  placeholder="财经大V最新观点与 AI 智能问答"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleSystemInfoSave}
                disabled={sysSaving}
                className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl px-4 py-2 text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {sysSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                保存
              </button>
              {sysSaved && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> 已保存
                </span>
              )}
            </div>
          </>
        )}
      </section>

      {/* 日志级别 */}
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200">日志级别</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          控制后端日志输出详细程度。DEBUG 最详细，CRITICAL 只输出致命错误
        </p>
        <div className="grid grid-cols-5 gap-2">
          {LOG_LEVELS.map((level) => {
            const isActive = logLevel === level
            return (
              <button
                key={level}
                onClick={() => handleLogLevelChange(level)}
                disabled={logSaving}
                className={`relative px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                } disabled:opacity-50`}
              >
                {level}
                {isActive && <Check className="w-3 h-3 absolute top-1 right-1 opacity-60" />}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 h-5">
          {logSaving && (
            <span className="text-xs text-neutral-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> 保存中...
            </span>
          )}
          {logSaved && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Check className="w-3 h-3" /> 已生效
            </span>
          )}
        </div>
      </section>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        爬虫 Cookie、JWT Secret 等敏感配置请通过 config.json 文件设置。
      </p>
    </div>
  )

  const renderCrawl = () => (
    <section className="glass-card dark:glass-card-dark rounded-xl p-5">
      <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200">定时爬取</h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
        设置增量爬取的频率，自动在后台采集各平台的新内容
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {INTERVAL_OPTIONS.map((opt) => {
            const isActive = crawlInterval?.minutes === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => handleIntervalChange(opt.value)}
                disabled={saving}
                className={`relative px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                } disabled:opacity-50`}
              >
                {opt.label}
                {isActive && <Check className="w-3.5 h-3.5 absolute top-1.5 right-1.5 opacity-60" />}
              </button>
            )
          })}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 h-5">
        {saving && (
          <span className="text-xs text-neutral-400 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> 保存中...
          </span>
        )}
        {saved && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> 已保存，立即生效
          </span>
        )}
        {!saving && !saved && crawlInterval && crawlInterval.minutes > 0 && (
          <span className="text-xs text-neutral-400">
            当前：{crawlInterval.label}，爬取完成后自动等待下次触发
          </span>
        )}
      </div>
    </section>
  )

  const renderTools = () => (
    <div className="space-y-6">
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
          <Wrench className="w-5 h-5" />
          工具设置
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          配置 AI 问答可用的实时工具，让助手能查询行情、搜索网络
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : toolsSettings && (
          <div className="space-y-4">
            {/* 启用开关 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">启用工具调用</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  开启后 AI 可自动调用搜索和行情工具回答时效性问题
                </div>
              </div>
              <button
                onClick={handleToolsToggle}
                disabled={toolsSaving}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  toolsSettings.enable_tools ? 'bg-green-600' : 'bg-neutral-300 dark:bg-neutral-600'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  toolsSettings.enable_tools ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Tavily API Key */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                Tavily API Key
                {toolsSettings.tavily_api_key_set && (
                  <span className="text-xs text-green-600 dark:text-green-400 font-normal">已配置</span>
                )}
              </label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                用于网络搜索工具。免费额度：<a href="https://tavily.com" target="_blank" rel="noopener" className="underline hover:text-neutral-700 dark:hover:text-neutral-300">tavily.com</a> 注册获取
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tavilyKeyInput}
                  onChange={(e) => setTavilyKeyInput(e.target.value)}
                  placeholder={toolsSettings.tavily_api_key_set ? '••••••••（已设置，留空不修改）' : 'tvly-xxxxx'}
                  className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
                />
                <button
                  onClick={handleTavilyKeySave}
                  disabled={toolsSaving || !tavilyKeyInput.trim()}
                  className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl px-4 py-2 text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {toolsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  保存
                </button>
              </div>
            </div>

            {/* 可用工具列表 */}
            <div>
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">可用工具</div>
              <div className="space-y-2">
                {[
                  { icon: Globe, color: 'text-blue-500', name: '网络搜索', desc: '搜索最新新闻、市场动态', needKey: true },
                  { icon: TrendingUp, color: 'text-green-500', name: '股票行情', desc: '查询 A 股/港股/美股实时价格', needKey: false },
                  { icon: BarChart3, color: 'text-purple-500', name: '市场概况', desc: '获取主要指数行情概览', needKey: false },
                ].map((tool) => {
                  const Icon = tool.icon
                  const available = toolsSettings.enable_tools && (!tool.needKey || toolsSettings.tavily_api_key_set)
                  return (
                    <div key={tool.name} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                      <Icon className={`w-4 h-4 ${tool.color}`} />
                      <div>
                        <div className="text-sm text-neutral-800 dark:text-neutral-200">{tool.name}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{tool.desc}</div>
                      </div>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                        available
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
                      }`}>
                        {available ? '可用' : tool.needKey ? '需配置 Key' : '已禁用'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {toolsSaved && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> 已保存
              </span>
            )}
          </div>
        )}
      </section>
    </div>
  )

  const isRunning = piStatus && (piStatus.status === 'pending' || piStatus.status === 'running')

  const renderHoldings = () => (
    <div className="space-y-6">
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-neutral-400" />
          教授指数解析
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          从历史文章中提取"教授指数"的持仓配置（内地版/全球版），解析后展示在公共主页。
        </p>

        {/* 间隔配置 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">自动解析间隔</label>
          <div className="grid grid-cols-4 gap-2">
            {PI_INTERVAL_OPTIONS.map((opt) => {
              const isActive = piInterval === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => handlePiIntervalChange(opt.value)}
                  disabled={piIntervalSaving}
                  className={`relative px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  } disabled:opacity-50`}
                >
                  {opt.label}
                  {isActive && <Check className="w-3 h-3 absolute top-1 right-1 opacity-60" />}
                </button>
              )
            })}
          </div>
          <div className="mt-2 h-5">
            {piIntervalSaving && (
              <span className="text-xs text-neutral-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> 保存中...
              </span>
            )}
            {piIntervalSaved && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> 已保存
              </span>
            )}
          </div>
        </div>

        {/* 手动触发 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleParseProfessorIndex}
            disabled={!!isRunning || piParsing}
            className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl px-4 py-2.5 text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {(isRunning || piParsing) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isRunning ? '解析中...' : '手动触发解析'}
          </button>
          {isRunning && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              任务正在后台运行，请稍候...
            </span>
          )}
          {piStatus && piStatus.status === 'done' && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              {piStatus.message || `完成: 内地版${piStatus.china_count}项, 全球版${piStatus.global_count}项`}
            </span>
          )}
          {piStatus && piStatus.status === 'error' && (
            <span className="text-xs text-red-500 dark:text-red-400">
              失败: {piStatus.error_message || '未知错误'}
            </span>
          )}
        </div>

        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-3">
          点击后将自动抓取最新专栏文章，再由 AI 分析所有历史文章提取持仓配置。
        </p>
      </section>

      {/* 历史记录 */}
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-sm font-medium mb-3 text-neutral-800 dark:text-neutral-200">解析历史</h2>
        {piHistory.length === 0 ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-500">暂无解析记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700">
                  <th className="text-left py-2 pr-3 font-medium text-neutral-500 dark:text-neutral-400">#</th>
                  <th className="text-left py-2 pr-3 font-medium text-neutral-500 dark:text-neutral-400">触发</th>
                  <th className="text-left py-2 pr-3 font-medium text-neutral-500 dark:text-neutral-400">状态</th>
                  <th className="text-right py-2 pr-3 font-medium text-neutral-500 dark:text-neutral-400">文章</th>
                  <th className="text-right py-2 pr-3 font-medium text-neutral-500 dark:text-neutral-400">内地版</th>
                  <th className="text-right py-2 pr-3 font-medium text-neutral-500 dark:text-neutral-400">全球版</th>
                  <th className="text-left py-2 font-medium text-neutral-500 dark:text-neutral-400">时间</th>
                </tr>
              </thead>
              <tbody>
                {piHistory.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <td className="py-2 pr-3 text-neutral-500 dark:text-neutral-400">{t.id}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        t.triggered_by === 'schedule'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
                      }`}>
                        {t.triggered_by === 'schedule' ? '定时' : '手动'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        t.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : t.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : t.status === 'running' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
                      }`}>
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right text-neutral-600 dark:text-neutral-300">{t.articles_fetched || '-'}</td>
                    <td className="py-2 pr-3 text-right text-neutral-600 dark:text-neutral-300">{t.china_count || '-'}</td>
                    <td className="py-2 pr-3 text-right text-neutral-600 dark:text-neutral-300">{t.global_count || '-'}</td>
                    <td className="py-2 text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                      {t.started_at ? new Date(t.started_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )

  const tabContent: Record<TabKey, () => React.JSX.Element> = {
    basic: renderBasic,
    crawl: renderCrawl,
    tools: renderTools,
    holdings: renderHoldings,
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-neutral-100">系统设置</h1>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                isActive
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tabContent[activeTab]()}
    </div>
  )
}
