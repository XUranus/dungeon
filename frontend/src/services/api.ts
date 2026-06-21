import type { Topic, Comment, CrawlTask, PaginatedResponse } from '../types'

const BASE = '/api'

// ---- Token management ----
let _token: string | null = null

export function setToken(token: string | null) {
  _token = token
}

// 初始化时从 localStorage 恢复
if (typeof window !== 'undefined') {
  _token = localStorage.getItem('admin_token')
}

/**
 * 将外部图片 URL 通过后端代理加载，绕过知识星球/知乎防盗链。
 * 非 zsxq/zhimg 图片原样返回。
 */
export function proxiedImageUrl(url: string): string {
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
export const login = (password: string) =>
  request<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })

export const checkAuth = (token: string) =>
  request<{ ok: boolean }>('/auth/check', {
    headers: { Authorization: `Bearer ${token}` },
  })

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
  page?: number
  page_size?: number
} = {}) => {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) sp.set(k, String(v))
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

export interface ProfessorIndexVersion {
  snapshot_id: number
  snapshot_at: string | null
  notes: string | null
  holdings: ProfessorIndexHolding[]
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
