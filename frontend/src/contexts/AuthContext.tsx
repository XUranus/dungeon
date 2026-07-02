import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { verifyApiKey, setApiKey, clearApiKey } from '../services/api'

interface AuthContextType {
  token: string | null
  isAdmin: boolean
  login: (apiKey: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_KEY_STORAGE = 'api_key'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    return localStorage.getItem(API_KEY_STORAGE)
  })

  const isAdmin = token !== null

  // 启动时验证已存储的 key 是否仍有效
  useEffect(() => {
    if (!token) return
    setApiKey(token)
    verifyApiKey(token)
      .then(() => {})
      .catch(() => {
        setTokenState(null)
        clearApiKey()
      })
  }, [token])

  const login = async (apiKey: string) => {
    await verifyApiKey(apiKey)
    setApiKey(apiKey)
    setTokenState(apiKey)
  }

  const logout = () => {
    setTokenState(null)
    clearApiKey()
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
