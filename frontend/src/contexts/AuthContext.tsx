import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { login as apiLogin, checkAuth, setToken as setApiToken } from '../services/api'

interface AuthContextType {
  token: string | null
  isAdmin: boolean
  login: (password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'admin_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    const saved = localStorage.getItem(TOKEN_KEY)
    setApiToken(saved)
    return saved
  })

  const isAdmin = token !== null

  // 同步 token 到 API service
  useEffect(() => {
    setApiToken(token)
  }, [token])

  // 启动时验证 token 是否仍有效
  useEffect(() => {
    if (!token) return
    checkAuth(token)
      .then(() => {})
      .catch(() => {
        // token 失效，清除
        setTokenState(null)
        localStorage.removeItem(TOKEN_KEY)
      })
  }, [token])

  const login = async (password: string) => {
    const res = await apiLogin(password)
    setTokenState(res.token)
    localStorage.setItem(TOKEN_KEY, res.token)
  }

  const logout = () => {
    setTokenState(null)
    localStorage.removeItem(TOKEN_KEY)
  }

  return (
    <AuthContext.Provider value={{ token, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
