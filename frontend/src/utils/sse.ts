export interface SSEMessage {
  event: 'message' | 'done' | 'error' | 'tool'
  data: string
}

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 1000

export function connectSSE(
  url: string,
  options: {
    onMessage?: (msg: SSEMessage) => void
    onError?: (error: Error) => void
    abortSignal?: AbortSignal
  }
): () => void {
  const { onMessage, onError, abortSignal } = options
  let disposed = false
  let reconnectAttempts = 0

  const run = async () => {
    while (!disposed) {
      try {
        const headers: Record<string, string> = { Accept: 'text/event-stream' }
        const token = localStorage.getItem('admin_token')
        if (token) headers['Authorization'] = `Bearer ${token}`

        const resp = await fetch(url, { headers, signal: abortSignal })
        if (!resp.ok) {
          if (resp.status === 401 || resp.status === 403) {
            onMessage?.({ event: 'error', data: '认证失败，请重新登录' })
            break
          }
          throw new Error(`SSE连接失败: ${resp.status}`)
        }

        const reader = resp.body?.getReader()
        if (!reader) throw new Error('无法读取响应流')
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = 'message'

        reconnectAttempts = 0

        const processLine = (line: string) => {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
            return
          }
          if (line.startsWith('data:')) {
            const data = line.slice(5)
            onMessage?.({ event: currentEvent as SSEMessage['event'], data })
            currentEvent = 'message'
            return
          }
          if (line === '') {
            currentEvent = 'message'
          }
        }

        for (;;) {
          if (disposed) break
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) processLine(line)
        }

        if (buffer) processLine(buffer)
        break
      } catch (err: unknown) {
        if (disposed) break
        if (abortSignal?.aborted) break
        if (err instanceof DOMException && err.name === 'AbortError') break

        reconnectAttempts++
        if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
          onError?.(new Error('SSE重连失败，请检查网络后重试'))
          break
        }
        await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS * reconnectAttempts))
      }
    }
  }

  void run()

  return () => {
    disposed = true
  }
}
