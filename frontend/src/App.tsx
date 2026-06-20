import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import Sidebar from './components/layout/Sidebar'
import ProtectedRoute from './components/auth/ProtectedRoute'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import TopicsPage from './pages/TopicsPage'
import SourcesPage from './pages/SourcesPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* 公共路由 - 无侧边栏 */}
            <Route path="/" element={<DashboardPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* 管理员路由 - 带侧边栏 */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute>
                  <div className="flex h-screen overflow-hidden">
                    <Sidebar />
                    <main className="flex-1 overflow-y-auto">
                      <Routes>
                        <Route path="/chat/:sessionId" element={<ChatPage />} />
                        <Route path="/chat" element={<ChatPage />} />
                        <Route path="/topics" element={<TopicsPage />} />
                        <Route path="/crawl" element={<SourcesPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                      </Routes>
                    </main>
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}
