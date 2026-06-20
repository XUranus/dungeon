/** 对话会话 */
export interface ChatSession {
  id: string
  title: string
  messages: { role: string; content: string }[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'chat_sessions'
const MAX_SESSIONS = 50

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** 从第一条用户消息生成标题 */
function generateTitle(messages: { role: string; content: string }[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return '新对话'
  const text = firstUser.content.trim()
  return text.length > 30 ? text.slice(0, 30) + '...' : text
}

/** 加载所有会话 */
export function loadSessions(scope: 'public' | 'admin'): ChatSession[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${scope}`)
    if (!raw) return []
    return JSON.parse(raw) as ChatSession[]
  } catch {
    return []
  }
}

/** 保存会话列表 */
function saveSessions(scope: 'public' | 'admin', sessions: ChatSession[]) {
  // 按更新时间倒序，保留最近 MAX_SESSIONS 个
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS)
  localStorage.setItem(`${STORAGE_KEY}_${scope}`, JSON.stringify(sessions))
}

/** 创建新会话 */
export function createSession(scope: 'public' | 'admin', messages: { role: string; content: string }[]): ChatSession {
  const session: ChatSession = {
    id: generateId(),
    title: generateTitle(messages),
    messages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const sessions = loadSessions(scope)
  sessions.unshift(session)
  saveSessions(scope, sessions)
  return session
}

/** 更新已有会话 */
export function updateSession(scope: 'public' | 'admin', sessionId: string, messages: { role: string; content: string }[]) {
  const sessions = loadSessions(scope)
  const idx = sessions.findIndex((s) => s.id === sessionId)
  if (idx === -1) return
  sessions[idx].messages = messages
  sessions[idx].title = generateTitle(messages)
  sessions[idx].updatedAt = Date.now()
  saveSessions(scope, sessions)
}

/** 删除会话 */
export function deleteSession(scope: 'public' | 'admin', sessionId: string) {
  const sessions = loadSessions(scope).filter((s) => s.id !== sessionId)
  saveSessions(scope, sessions)
}

/** 加载单个会话 */
export function loadSession(scope: 'public' | 'admin', sessionId: string): ChatSession | null {
  const sessions = loadSessions(scope)
  return sessions.find((s) => s.id === sessionId) ?? null
}
