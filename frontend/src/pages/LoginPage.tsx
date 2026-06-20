import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setLoading(true)
    setError('')
    try {
      await login(password)
      navigate('/admin/crawl')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass dark:glass-dark rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-900 dark:bg-white mb-3">
            <Lock className="w-5 h-5 text-white dark:text-neutral-900" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">管理员登录</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">输入密码进入后台管理</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入管理员密码"
            className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 border border-neutral-200 dark:border-neutral-700"
            autoFocus
            disabled={loading}
          />

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl py-3 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              '登 录'
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a
            href="/"
            className="text-sm text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            ← 返回首页大屏
          </a>
        </div>
      </div>
    </div>
  )
}
