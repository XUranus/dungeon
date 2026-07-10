import type { Topic, Comment, CrawlTask, PaginatedResponse } from '../types'

const BASE = '/api'

// ---- API Key management ----
const API_KEY_STORAGE = 'api_key'
let _token: string | null = null

export function setApiKey(key: string | null) {
  _token = key
  if (key) {
    localStorage.setItem(API_KEY_STORAGE, key)
  } else {
    localStorage.removeItem(API_KEY_STORAGE)
  }
}

export function clearApiKey() {
  _token = null
  localStorage.removeItem(API_KEY_STORAGE)
}

// 初始化时从 localStorage 恢复
if (typeof window !== 'undefined') {
  _token = localStorage.getItem(API_KEY_STORAGE)
}

/**
 * 将外部图片 URL 通过后端代理加载，绕过知识星球/知乎防盗链。
 * 优先使用本地路径（localPath），非 zsxq/zhimg 图片原样返回。
 */
export function proxiedImageUrl(url: string, localPath?: string): string {
  if (localPath) {
    return `${BASE}/proxy/${localPath}`
  }
  if (url.includes('zsxq.com') || url.includes('zhimg.com')) {
    return `${BASE}/proxy/image?url=${encodeURIComponent(url)}`
  }
  return url
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`
  }

  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ---- Auth ----
export const verifyApiKey = (api_key: string) =>
  request<{ ok: boolean }>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ api_key }),
  })

export interface KeyInfoResponse {
  api_key_set: boolean
  api_key_preview: string
}

export interface KeyRefreshResponse {
  api_key: string
  api_key_preview: string
}

export const fetchApiKeyInfo = () =>
  request<KeyInfoResponse>('/auth/key')

export const refreshApiKey = () =>
  request<KeyRefreshResponse>('/auth/key/refresh', { method: 'PUT' })

// ---- Dashboard (public) ----
export interface DashboardSummaryItem {
  id: number
  platform: string
  title: string | null
  content_preview: string
  content_type: string
  url: string | null
  like_count: number
  published_at: string | null
}

export const fetchDashboardSummary = (limit: number = 20) =>
  request<{ items: DashboardSummaryItem[]; chat_remaining: number }>(
    `/dashboard/summary?limit=${limit}`
  )

export const fetchChatRemaining = () =>
  request<{ used: number; limit: number; remaining: number }>('/dashboard/chat-remaining')

export const fetchDashboardStats = () =>
  request<{ total: number; articles: number; qa: number }>('/dashboard/stats')

// ---- Holdings (public) ----
export interface RecommendedHolding {
  id: number
  stock_name: string
  stock_code: string | null
  sentiment: 'bullish' | 'bearish' | 'neutral'
  reason: string
  source_kols: string[]
  confidence: number
  generated_at: string | null
}

export const fetchHoldings = () =>
  request<RecommendedHolding[]>('/dashboard/holdings')

// ---- Holdings (admin) ----
export const generateHoldings = () =>
  request<{ message: string; count: number }>('/holdings/generate', { method: 'POST' })

export const fetchAllHoldings = () =>
  request<RecommendedHolding[]>('/holdings')

export const deleteHolding = (id: number) =>
  request<{ message: string }>(`/holdings/${id}`, { method: 'DELETE' })

// ---- Topics (admin) ----
export const fetchTopics = (params: {
  platform?: string
  content_type?: string
  search?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
} = {}) => {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  })
  return request<PaginatedResponse<Topic>>(`/topics?${sp}`)
}

export const fetchComments = (topicId: number) =>
  request<Comment[]>(`/topics/${topicId}/comments`)

// ---- Sources (admin) ----
export const fetchPlatforms = () =>
  request<{ platforms: string[] }>('/sources/platforms')

export const crawlAll = () =>
  request<Array<{ platform: string; status: string; topics_count: number; comments_count: number }>>(
    '/sources/crawl',
    { method: 'POST' }
  )

export const crawlPlatform = (platform: string) =>
  request<{ platform: string; status: string; topics_count: number; comments_count: number }>(
    `/sources/crawl/${platform}`,
    { method: 'POST' }
  )

export const fetchCrawlTasks = () =>
  request<CrawlTask[]>('/sources/tasks')

// Async crawl (background task)
export interface CrawlProgress {
  task_id: string
  platform: string
  status: 'running' | 'done' | 'error'
  progress: {
    phase: string
    topics_found: number
    topics_saved: number
    comments_saved: number
  }
  started_at: string
  finished_at: string | null
  error: string | null
}

export const startCrawlAsync = (platform: string = 'zsxq') =>
  request<{ task_id: string; platform: string; status: string }>(
    `/sources/crawl/async?platform=${platform}`,
    { method: 'POST' }
  )

export const fetchCrawlStatus = () =>
  request<CrawlProgress | { status: 'idle' }>('/sources/crawl/status')

// ---- Settings (admin) ----
export interface CrawlIntervalResponse {
  minutes: number
  label: string
}

export const fetchCrawlInterval = () =>
  request<CrawlIntervalResponse>('/settings/crawl-interval')

export const updateCrawlInterval = (minutes: number) =>
  request<CrawlIntervalResponse>('/settings/crawl-interval', {
    method: 'PUT',
    body: JSON.stringify({ minutes }),
  })

export interface SystemInfo {
  system_title: string
  system_subtitle: string
}

export const fetchSystemInfo = () =>
  request<SystemInfo>('/settings/system-info')

export const updateSystemInfo = (data: SystemInfo) =>
  request<SystemInfo>('/settings/system-info', {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export interface ToolsSettings {
  enable_tools: boolean
  tavily_api_key_set: boolean
}

// ---- System Avatar & Owner (public) ----
export interface SystemAvatarResponse {
  avatar_url: string
}

export interface SystemOwnerResponse {
  owner_name: string
  avatar_url: string
}

export const fetchSystemAvatar = () =>
  request<SystemAvatarResponse>('/settings/system-avatar')

export const fetchSystemOwner = () =>
  request<SystemOwnerResponse>('/settings/system-owner')

export const updateSystemOwnerName = (owner_name: string) =>
  request<{ owner_name: string }>('/settings/system-owner-name', {
    method: 'PUT',
    body: JSON.stringify({ owner_name }),
  })

export const updateSystemAvatar = (avatar_url: string) =>
  request<SystemAvatarResponse>('/settings/system-avatar', {
    method: 'PUT',
    body: JSON.stringify({ avatar_url }),
  })

export const uploadSystemAvatar = async (file: File): Promise<SystemAvatarResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  const headers: Record<string, string> = {}
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const res = await fetch(`${BASE}/settings/system-avatar/upload`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export const fetchToolsSettings = () =>
  request<ToolsSettings>('/settings/tools')

export const updateToolsSettings = (data: { enable_tools?: boolean; tavily_api_key?: string }) =>
  request<ToolsSettings>('/settings/tools', {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export interface LogLevelResponse {
  level: string
}

export const fetchLogLevel = () =>
  request<LogLevelResponse>('/settings/log-level')

export const updateLogLevel = (level: string) =>
  request<LogLevelResponse>('/settings/log-level', {
    method: 'PUT',
    body: JSON.stringify({ level }),
  })

// ---- Professor Index ----
export interface ProfessorIndexHolding {
  name: string
  code: string | null
  market: string
  weight: number | null
}

export interface ProfessorIndexSourceArticle {
  id: number
  title: string | null
  url: string | null
  published_at: string | null
  content_type: string
}

export interface ProfessorIndexVersion {
  snapshot_id: number
  snapshot_at: string | null
  notes: string | null
  holdings: ProfessorIndexHolding[]
  source_articles: ProfessorIndexSourceArticle[]
}

export type ProfessorIndexData = Record<string, ProfessorIndexVersion | null>

export const fetchProfessorIndex = () =>
  request<ProfessorIndexData>('/dashboard/professor-index')

export const parseProfessorIndex = () =>
  request<{ china: string[]; global: string[]; message: string }>('/professor-index/parse', {
    method: 'POST',
  })

// ---- Professor Index Parse Tasks ----
export interface ParseTask {
  id: number
  status: 'pending' | 'running' | 'done' | 'error'
  triggered_by: 'manual' | 'schedule'
  articles_fetched: number
  china_count: number
  global_count: number
  message: string | null
  error_message: string | null
  started_at: string | null
  finished_at: string | null
}

export const startProfessorIndexParse = () =>
  request<{ task_id: number; status: string }>('/professor-index/parse', { method: 'POST' })

export const fetchProfessorIndexParseStatus = () =>
  request<ParseTask | { status: 'idle' }>('/professor-index/parse/status')

export const fetchProfessorIndexParseHistory = () =>
  request<ParseTask[]>('/professor-index/parse/history')

export const fetchProfessorIndexInterval = () =>
  request<{ interval_days: number }>('/professor-index/interval')

export const updateProfessorIndexInterval = (interval_days: number) =>
  request<{ interval_days: number }>('/professor-index/interval', {
    method: 'PUT',
    body: JSON.stringify({ interval_days }),
  })

// ---- Public Plugins ----

export interface PluginMeta {
  id: string
  name: string
  icon: string
  description: string
  order: number
}

/** 公开：获取已启用的插件列表（无需登录） */
export const fetchEnabledPlugins = () =>
  request<{ plugins: PluginMeta[] }>('/dashboard/plugins')

/** 管理员：获取所有插件（含启用状态） */
export interface AdminPluginItem extends PluginMeta {
  enabled: boolean
  has_config?: boolean
  has_hooks?: boolean
}

export const fetchAdminPlugins = () =>
  request<{ plugins: AdminPluginItem[] }>('/settings/public-plugins')

/** 管理员：更新启用的插件列表 */
export const updateEnabledPlugins = (enabled_ids: string[]) =>
  request<{ enabled_ids: string[] }>('/settings/public-plugins', {
    method: 'PUT',
    body: JSON.stringify({ enabled_ids }),
  })

// ---- Plugin Runtime ----

export interface PluginRuntimeItem {
  id: string
  name: string
  icon: string
  description: string
  order: number
  enabled: boolean
  has_config: boolean
  has_hooks: boolean
}

export interface PluginConfigData {
  plugin_id: string
  config: Record<string, unknown>
  defaults: Record<string, unknown>
}

export interface PluginEventLogEntry {
  event: string
  plugin_id: string
  status: 'ok' | 'error' | 'skipped'
  message: string
  duration_ms: number
  timestamp: number
}

/** Admin: list all plugins with runtime info */
export const fetchPluginRuntimeList = () =>
  request<PluginRuntimeItem[]>('/plugins/')

/** Admin: get plugin config */
export const fetchPluginConfig = (pluginId: string) =>
  request<PluginConfigData>(`/plugins/config/${pluginId}`)

/** Admin: update plugin config (merge-patch) */
export const updatePluginConfig = (pluginId: string, config: Record<string, unknown>) =>
  request<PluginConfigData>(`/plugins/config/${pluginId}`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })

/** Admin: get event log */
export const fetchPluginEventLog = (params?: { plugin_id?: string; event?: string; limit?: number }) => {
  const qs = new URLSearchParams()
  if (params?.plugin_id) qs.set('plugin_id', params.plugin_id)
  if (params?.event) qs.set('event', params.event)
  if (params?.limit) qs.set('limit', String(params.limit))
  const q = qs.toString()
  return request<PluginEventLogEntry[]>(`/plugins/events${q ? '?' + q : ''}`)
}

/** Plugin: report an event execution (public) */
export const reportPluginEvent = (pluginId: string, event: string, status = 'ok', message = '') =>
  request<{ ok: boolean }>('/plugins/events/report', {
    method: 'POST',
    body: JSON.stringify({ plugin_id: pluginId, event, status, message }),
  })

/** Plugin: read own config (public) */
export const fetchPluginConfigPublic = (pluginId: string) =>
  request<PluginConfigData>(`/plugins/config/${pluginId}`)


// ── LLM 配置 ──

export interface LLMConfig {
  openai_api_key: string
  openai_base_url: string
  openai_model: string
  embedding_model: string
  embedding_provider: string
}

export const fetchLLMConfig = () =>
  request<LLMConfig>('/settings/llm')

export const updateLLMConfig = (data: LLMConfig) =>
  request<LLMConfig>('/settings/llm', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
