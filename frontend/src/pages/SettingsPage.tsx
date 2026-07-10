import { useState, useEffect, useRef } from 'react'
import {
  Loader2, Check, Settings, Database, Bot, Sparkles, Wrench, Key, Globe,
  TrendingUp, BarChart3, Copy, RefreshCw, Puzzle, ChevronRight, Clock,
  AlertCircle, FileText, AlertTriangle,
} from 'lucide-react'
import {
  fetchCrawlInterval, updateCrawlInterval, type CrawlIntervalResponse,
  fetchSystemInfo, updateSystemInfo, type SystemInfo,
  updateSystemAvatar, uploadSystemAvatar,
  fetchSystemOwner, updateSystemOwnerName,
  fetchLLMConfig, updateLLMConfig, type LLMConfig,
  fetchToolsSettings, updateToolsSettings, type ToolsSettings,
  fetchLogLevel, updateLogLevel,
  fetchApiKeyInfo, refreshApiKey, type KeyInfoResponse,
  fetchAdminPlugins, updateEnabledPlugins, type AdminPluginItem,
  fetchPluginConfig, updatePluginConfig, fetchPluginEventLog,
  type PluginConfigData, type PluginEventLogEntry,
} from '../services/api'

const INTERVAL_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 1, label: '每 1 分钟' },
  { value: 30, label: '每 30 分钟' },
  { value: 60, label: '每 1 小时' },
]

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']

const TABS = [
  { key: 'basic', label: '基础', icon: Settings },
  { key: 'llm', label: 'LLM', icon: Bot },
  { key: 'crawl', label: '采集', icon: Database },
  { key: 'tools', label: '工具', icon: Wrench },
  { key: 'api', label: 'API', icon: Key },
  { key: 'plugins', label: '插件', icon: Puzzle },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('basic')

  // ---- System info ----
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [sysSaving, setSysSaving] = useState(false)
  const [sysSaved, setSysSaved] = useState(false)

  // ---- Avatar & Owner ----
  const [ownerName, setOwnerName] = useState('')
  const [ownerNameSaving, setOwnerNameSaving] = useState(false)
  const [ownerNameSaved, setOwnerNameSaved] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarSaved, setAvatarSaved] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- Crawl interval ----
  const [crawlInterval, setCrawlInterval] = useState<CrawlIntervalResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // ---- LLM config ----
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null)
  const [llmApiKeyInput, setLlmApiKeyInput] = useState('')
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmSaved, setLlmSaved] = useState(false)
  const [llmError, setLlmError] = useState('')

  // ---- Tools settings ----
  const [toolsSettings, setToolsSettings] = useState<ToolsSettings | null>(null)
  const [tavilyKeyInput, setTavilyKeyInput] = useState('')
  const [toolsSaving, setToolsSaving] = useState(false)
  const [toolsSaved, setToolsSaved] = useState(false)

  // ---- Log level ----
  const [logLevel, setLogLevel] = useState<string>('INFO')
  const [logSaving, setLogSaving] = useState(false)
  const [logSaved, setLogSaved] = useState(false)

  // ---- API Key ----
  const [keyInfo, setKeyInfo] = useState<KeyInfoResponse | null>(null)
  const [keyRefreshing, setKeyRefreshing] = useState(false)
  const [keyNew, setKeyNew] = useState<string | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  // ---- Plugins ----
  const [plugins, setPlugins] = useState<AdminPluginItem[]>([])
  const [pluginsSaving, setPluginsSaving] = useState(false)
  const [pluginsSaved, setPluginsSaved] = useState(false)
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
  const [pluginConfig, setPluginConfig] = useState<PluginConfigData | null>(null)
  const [pluginConfigJson, setPluginConfigJson] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const [configError, setConfigError] = useState('')
  const [eventLog, setEventLog] = useState<PluginEventLogEntry[]>([])
  const [eventLogLoading, setEventLogLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchSystemInfo().then(setSysInfo),
      fetchSystemOwner().then((res) => { setOwnerName(res.owner_name); setAvatarUrl(res.avatar_url) }),
      fetchCrawlInterval().then(setCrawlInterval),
      fetchLLMConfig().then((res) => {
        setLlmConfig(res)
        // 不回填API Key，让用户手动输入
      }),
      fetchToolsSettings().then(setToolsSettings),
      fetchLogLevel().then((res) => setLogLevel(res.level)),
      fetchApiKeyInfo().then(setKeyInfo),
      fetchAdminPlugins().then((res) => setPlugins(res.plugins)).catch(() => {}),
    ]).finally(() => { setLoading(false) })
  }, [])

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

  const handleOwnerNameSave = async () => {
    setOwnerNameSaving(true)
    setOwnerNameSaved(false)
    try {
      await updateSystemOwnerName(ownerName)
      setOwnerNameSaved(true)
      setTimeout(() => setOwnerNameSaved(false), 2000)
    } catch { /* ignore */ } finally { setOwnerNameSaving(false) }
  }

  const handleAvatarSave = async () => {
    setAvatarSaving(true)
    setAvatarSaved(false)
    try {
      const res = await updateSystemAvatar(avatarUrl)
      setAvatarUrl(res.avatar_url)
      setAvatarSaved(true)
      setTimeout(() => setAvatarSaved(false), 2000)
    } catch { /* ignore */ } finally { setAvatarSaving(false) }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    setAvatarError('')
    try {
      const res = await uploadSystemAvatar(file)
      setAvatarUrl(res.avatar_url)
      setAvatarSaved(true)
      setTimeout(() => setAvatarSaved(false), 2000)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : '上传失败')
      setTimeout(() => setAvatarError(''), 3000)
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleLLMSave = async () => {
    if (!llmConfig) return
    setLlmSaving(true)
    setLlmSaved(false)
    setLlmError('')
    try {
      const updateData: LLMConfig = {
        ...llmConfig,
        // 如果用户输入了新的API Key，则使用新的；否则保持原样（脱敏的）
        openai_api_key: llmApiKeyInput || llmConfig.openai_api_key,
      }
      const res = await updateLLMConfig(updateData)
      setLlmConfig(res)
      setLlmApiKeyInput('') // 清空输入框
      setLlmSaved(true)
      setTimeout(() => setLlmSaved(false), 2000)
    } catch (err) {
      setLlmError(err instanceof Error ? err.message : '保存失败')
      setTimeout(() => setLlmError(''), 3000)
    } finally { setLlmSaving(false) }
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

  const handleKeyRefresh = async () => {
    if (!confirm('刷新后旧 Key 立即失效，确定继续？')) return
    setKeyRefreshing(true)
    setKeyNew(null)
    setKeyCopied(false)
    try {
      const res = await refreshApiKey()
      setKeyInfo({ api_key_set: true, api_key_preview: res.api_key_preview })
      setKeyNew(res.api_key)
    } catch { /* ignore */ } finally { setKeyRefreshing(false) }
  }

  const handleKeyCopy = () => {
    const key = keyNew || ''
    if (!key) return
    navigator.clipboard.writeText(key)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 2000)
  }

  const abbreviate = (token: string) => {
    if (!token) return ''
    if (token.length <= 32) return token
    return token.slice(0, 16) + ' ··· ' + token.slice(-12)
  }

  const handlePluginToggle = async (pluginId: string) => {
    const updated = plugins.map(p =>
      p.id === pluginId ? { ...p, enabled: !p.enabled } : p
    )
    setPlugins(updated)
    setPluginsSaving(true)
    setPluginsSaved(false)
    try {
      const enabledIds = updated.filter(p => p.enabled).map(p => p.id)
      await updateEnabledPlugins(enabledIds)
      setPluginsSaved(true)
      setTimeout(() => setPluginsSaved(false), 2000)
    } catch { /* ignore */ } finally { setPluginsSaving(false) }
  }

  const handlePluginExpand = async (pluginId: string) => {
    if (expandedPlugin === pluginId) {
      setExpandedPlugin(null)
      return
    }
    setExpandedPlugin(pluginId)
    setConfigError('')
    try {
      const data = await fetchPluginConfig(pluginId)
      setPluginConfig(data)
      setPluginConfigJson(JSON.stringify(data.config, null, 2))
    } catch { /* ignore */ }
    setEventLogLoading(true)
    try {
      const logs = await fetchPluginEventLog({ plugin_id: pluginId, limit: 50 })
      setEventLog(logs)
    } catch { /* ignore */ } finally { setEventLogLoading(false) }
  }

  const handleConfigSave = async () => {
    if (!expandedPlugin) return
    setConfigError('')
    try {
      const parsed = JSON.parse(pluginConfigJson)
      setConfigSaving(true)
      const data = await updatePluginConfig(expandedPlugin, parsed)
      setPluginConfig(data)
      setPluginConfigJson(JSON.stringify(data.config, null, 2))
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2000)
    } catch (e) {
      if (e instanceof SyntaxError) {
        setConfigError('JSON 格式错误')
      } else {
        setConfigError((e as Error).message || '保存失败')
      }
    } finally { setConfigSaving(false) }
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

      {/* 星主信息 */}
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200">星主信息</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          设置公共大屏 Hero 区域显示的星主名称和头像
        </p>

        {/* 星主名称 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">星主名称</label>
          <div className="flex items-center gap-3">
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              maxLength={50}
              className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
              placeholder="例如：半佛仙人、E 大"
            />
            <button
              onClick={handleOwnerNameSave}
              disabled={ownerNameSaving}
              className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl px-4 py-2.5 text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all flex items-center gap-1.5 flex-shrink-0"
            >
              {ownerNameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              保存
            </button>
            {ownerNameSaved && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 flex-shrink-0">
                <Check className="w-3 h-3" /> 已保存
              </span>
            )}
          </div>
        </div>

        {/* 头像 */}
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">星主头像</label>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex-shrink-0 border-2 border-neutral-300 dark:border-neutral-600">
            {avatarUrl ? (
              <img src={avatarUrl} alt="头像预览" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                <Sparkles className="w-6 h-6" />
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3">
            {/* 上传按钮 */}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl px-4 py-2 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-all flex items-center gap-1.5 border border-neutral-200 dark:border-neutral-700"
              >
                {avatarUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                {avatarUploading ? '上传中...' : '上传图片'}
              </button>
              <span className="text-[11px] text-neutral-400">JPG / PNG / GIF / WebP / SVG，最大 5MB</span>
            </div>

            {/* URL 输入 */}
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              maxLength={500}
              className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
              placeholder="或直接填写图片 URL: https://example.com/avatar.jpg"
            />

            <div className="flex items-center gap-3">
              <button
                onClick={handleAvatarSave}
                disabled={avatarSaving}
                className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl px-4 py-2 text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {avatarSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                保存 URL
              </button>
              {avatarSaved && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> 已保存
                </span>
              )}
              {avatarError && (
                <span className="text-xs text-red-500 dark:text-red-400">{avatarError}</span>
              )}
            </div>
          </div>
        </div>
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

  const renderLLM = () => (
    <div className="space-y-5">
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200">LLM 配置</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          配置大语言模型的 API 地址、模型名称和密钥
        </p>

        {llmConfig ? (
          <div className="space-y-4">
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">API Key</label>
              <input
                type="password"
                value={llmApiKeyInput || llmConfig.openai_api_key}
                onChange={(e) => setLlmApiKeyInput(e.target.value)}
                className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
                placeholder="sk-..."
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {llmApiKeyInput ? '已修改，保存后生效' : '当前已配置，修改请直接输入新 Key'}
              </p>
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">API Base URL</label>
              <input
                value={llmConfig.openai_base_url}
                onChange={(e) => setLlmConfig({ ...llmConfig, openai_base_url: e.target.value })}
                className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                留空使用 OpenAI 官方地址，或填写兼容 API 地址（如 OneAPI、Azure）
              </p>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">模型名称</label>
              <input
                value={llmConfig.openai_model}
                onChange={(e) => setLlmConfig({ ...llmConfig, openai_model: e.target.value })}
                className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
                placeholder="gpt-4o"
              />
            </div>

            {/* Embedding Model */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Embedding 模型</label>
              <input
                value={llmConfig.embedding_model}
                onChange={(e) => setLlmConfig({ ...llmConfig, embedding_model: e.target.value })}
                className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
                placeholder="text-embedding-3-small"
              />
            </div>

            {/* Embedding Provider */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Embedding 提供商</label>
              <div className="flex gap-3">
                {['openai', 'local'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setLlmConfig({ ...llmConfig, embedding_provider: p })}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      llmConfig.embedding_provider === p
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {p === 'openai' ? 'OpenAI' : '本地模型'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                本地模型需要预先下载 BGE-Small-ZH-v1.5
              </p>
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleLLMSave}
                disabled={llmSaving}
                className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl px-5 py-2.5 text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {llmSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                保存配置
              </button>
              {llmSaved && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> 已保存
                </span>
              )}
              {llmError && (
                <span className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {llmError}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        )}
      </section>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        修改配置后会自动重试 LLM 连接，无需重启服务。
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

  const renderApi = () => {
    const displayValue = keyNew || (keyInfo?.api_key_set ? keyInfo.api_key_preview : '')
    return (
      <div className="space-y-6">
        <section className="glass-card dark:glass-card-dark rounded-xl p-5">
          <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Key
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-5">
            管理后台和外部 Agent（MCP）统一使用同一个 Key 鉴权。
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-neutral-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">加载中...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* API Key 展示 */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                <Key className="w-4 h-4 text-neutral-400 dark:text-neutral-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">当前 Key</div>
                  <code className="text-sm font-mono text-neutral-700 dark:text-neutral-300 truncate block">
                    {displayValue ? abbreviate(displayValue) : '（未设置）'}
                  </code>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {keyInfo?.api_key_set ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">已配置</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">未配置</span>
                  )}
                  <button
                    onClick={handleKeyCopy}
                    disabled={!keyNew}
                    className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 transition-all border border-neutral-200 dark:border-neutral-700"
                    title="复制完整 Key"
                  >
                    {keyCopied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={handleKeyRefresh}
                    disabled={keyRefreshing}
                    className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 transition-all border border-neutral-200 dark:border-neutral-700"
                    title="刷新 Key"
                  >
                    {keyRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* 新 Key 提示 */}
              {keyNew && (
                <div className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span>新 Key 已生成，旧 Key 已失效。请立即复制保存。</span>
                </div>
              )}

              {/* 受保护端点列表 */}
              <div>
                <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">受保护的端点</div>
                <div className="space-y-2">
                  {[
                    { method: 'POST', path: '/api/mcp/chat', desc: '流式问答', body: '{"message":"你好"}' },
                    { method: 'POST', path: '/api/mcp/search', desc: '知识库搜索', body: '{"query":"收益"}' },
                    { method: 'GET', path: '/api/mcp/topics', desc: '主题列表', body: null },
                    { method: 'GET', path: '/api/mcp/professor-index', desc: '教授指数', body: null },
                  ].map((ep) => {
                    const host = window.location.origin
                    const key = displayValue || 'YOUR_KEY'
                    const curl = ep.body
                      ? `curl -X ${ep.method} ${host}${ep.path} -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '${ep.body}'`
                      : `curl ${host}${ep.path} -H "Authorization: Bearer ${key}"`
                    return (
                      <div key={ep.path} className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${
                          ep.method === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                               : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}>{ep.method}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300">{ep.path}</span>
                            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{ep.desc}</span>
                          </div>
                          <code className="block text-[10px] font-mono text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 rounded px-2 py-1.5 border border-neutral-200 dark:border-neutral-700 break-all">
                            {curl}
                          </code>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(curl)}
                          className="shrink-0 p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 dark:text-neutral-500 transition-all"
                          title="复制 curl"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    )
  }

  const renderPlugins = () => (
    <div className="space-y-6">
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-lg font-medium mb-1 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
          <Puzzle className="w-5 h-5" />
          插件管理
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          管理公共页面插件。点击插件可展开配置编辑器和事件日志。
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : plugins.length === 0 ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-500">暂无已注册的插件</p>
        ) : (
          <div className="space-y-2">
            {plugins.map((plugin) => {
              const isExpanded = expandedPlugin === plugin.id
              return (
                <div key={plugin.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  {/* Plugin header row */}
                  <button
                    onClick={() => handlePluginExpand(plugin.id)}
                    className="w-full flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <ChevronRight className={`w-4 h-4 text-neutral-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{plugin.name}</span>
                          <code className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 font-mono">{plugin.id}</code>
                          {plugin.has_hooks && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">有钩子</span>
                          )}
                          {plugin.has_config && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">可配置</span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">{plugin.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePluginToggle(plugin.id) }}
                      disabled={pluginsSaving}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-3 ${
                        plugin.enabled ? 'bg-green-600' : 'bg-neutral-300 dark:bg-neutral-600'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        plugin.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </button>

                  {/* Expanded: Config + Event Log */}
                  {isExpanded && (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 space-y-5 bg-white dark:bg-neutral-900/50">
                      {/* Config Editor */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            配置 (JSON)
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (pluginConfig) {
                                  setPluginConfigJson(JSON.stringify(pluginConfig.defaults, null, 2))
                                }
                              }}
                              className="text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                            >
                              恢复默认值
                            </button>
                            <button
                              onClick={handleConfigSave}
                              disabled={configSaving}
                              className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg px-3 py-1.5 text-xs hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-all flex items-center gap-1"
                            >
                              {configSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              保存
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={pluginConfigJson}
                          onChange={(e) => { setPluginConfigJson(e.target.value); setConfigError('') }}
                          rows={8}
                          spellCheck={false}
                          className="w-full font-mono text-xs bg-neutral-900 dark:bg-neutral-950 text-green-400 rounded-lg p-3 border border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-600 resize-y"
                          placeholder="{}"
                        />
                        <div className="flex items-center gap-2 h-5 mt-1">
                          {configError && (
                            <span className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> {configError}
                            </span>
                          )}
                          {configSaved && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <Check className="w-3 h-3" /> 配置已保存
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Event Log */}
                      <div>
                        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 mb-2">
                          <Clock className="w-3.5 h-3.5" />
                          事件日志
                        </label>
                        {eventLogLoading ? (
                          <div className="flex items-center gap-2 text-neutral-400 py-4">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-xs">加载中...</span>
                          </div>
                        ) : eventLog.length === 0 ? (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 py-4">暂无事件记录</p>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-neutral-50 dark:bg-neutral-800">
                                  <th className="text-left py-2 px-3 font-medium text-neutral-500 dark:text-neutral-400">事件</th>
                                  <th className="text-left py-2 px-3 font-medium text-neutral-500 dark:text-neutral-400">状态</th>
                                  <th className="text-left py-2 px-3 font-medium text-neutral-500 dark:text-neutral-400">消息</th>
                                  <th className="text-right py-2 px-3 font-medium text-neutral-500 dark:text-neutral-400">耗时</th>
                                  <th className="text-right py-2 px-3 font-medium text-neutral-500 dark:text-neutral-400">时间</th>
                                </tr>
                              </thead>
                              <tbody>
                                {eventLog.map((entry, i) => (
                                  <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                                    <td className="py-2 px-3 font-mono text-neutral-700 dark:text-neutral-300">{entry.event}</td>
                                    <td className="py-2 px-3">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                        entry.status === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : entry.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
                                      }`}>
                                        {entry.status}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-neutral-500 dark:text-neutral-400 max-w-[200px] truncate">{entry.message || '-'}</td>
                                    <td className="py-2 px-3 text-right text-neutral-500 dark:text-neutral-400">{entry.duration_ms}ms</td>
                                    <td className="py-2 px-3 text-right text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
                                      {new Date(entry.timestamp * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Plugin path info */}
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        访问路径: <code className="font-mono">/p/{plugin.id}</code> &middot;
                        数据目录: <code className="font-mono">data/plugins/{plugin.id}/</code> &middot;
                        配置文件: <code className="font-mono">data/plugins/{plugin.id}/config.json</code>
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 h-5">
          {pluginsSaving && (
            <span className="text-xs text-neutral-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> 保存中...
            </span>
          )}
          {pluginsSaved && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Check className="w-3 h-3" /> 已保存
            </span>
          )}
        </div>
      </section>

      {/* Architecture info */}
      <section className="glass-card dark:glass-card-dark rounded-xl p-5">
        <h2 className="text-sm font-medium mb-2 text-neutral-800 dark:text-neutral-200">插件架构</h2>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1.5">
          <p>插件系统采用自动发现机制，支持完整的运行时管理：</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>数据访问</strong> — 插件可调用主系统全部公开 API</li>
            <li><strong>独立存储</strong> — 每个插件有独立数据目录 <code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 rounded">data/plugins/&lt;id&gt;/</code></li>
            <li><strong>事件钩子</strong> — 插件可 hook 主系统事件（如 crawl_completed、topic_created）</li>
            <li><strong>JSON 配置</strong> — 每个插件有独立 JSON 配置，可在上方编辑</li>
            <li><strong>事件日志</strong> — 插件执行记录可在上方查看</li>
          </ul>
        </div>
      </section>
    </div>
  )

  const tabContent: Record<TabKey, () => React.JSX.Element> = {
    basic: renderBasic,
    llm: renderLLM,
    crawl: renderCrawl,
    tools: renderTools,
    api: renderApi,
    plugins: renderPlugins,
  }

  return (
    <div className="p-6 max-w-4xl">
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
