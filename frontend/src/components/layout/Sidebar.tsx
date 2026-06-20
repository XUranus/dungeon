import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { MessageSquare, FileText, Settings, RefreshCw, Sun, Moon, LogOut, Home } from 'lucide-react'
import Logo from '../Logo'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { fetchSystemInfo, type SystemInfo } from '../../services/api'

const navItems = [
  { to: '/admin/chat', icon: MessageSquare, label: '问答' },
  { to: '/admin/topics', icon: FileText, label: '数据浏览' },
  { to: '/admin/crawl', icon: RefreshCw, label: '数据采集' },
  { to: '/admin/settings', icon: Settings, label: '设置' },
]

export default function Sidebar() {
  const { theme, toggle } = useTheme()
  const { logout } = useAuth()
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    system_title: '大V观点分析',
    system_subtitle: '',
  })

  useEffect(() => {
    fetchSystemInfo()
      .then((data) => {
        setSystemInfo(data)
        document.title = data.system_title
      })
      .catch(() => {})
  }, [])

  return (
    <aside className="w-56 flex flex-col glass dark:glass-dark border-r border-neutral-200/50 dark:border-neutral-700/50 shrink-0">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-neutral-200/50 dark:border-neutral-700/50">
        <div className="flex items-center gap-2 mb-2">
          <Logo className="text-neutral-900 dark:text-neutral-100" size={32} />
        </div>
        <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
          {systemInfo.system_title}
        </h1>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">管理后台</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-3 border-t border-neutral-200/50 dark:border-neutral-700/50 space-y-1">
        <a
          href="/"
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
        >
          <Home className="w-4 h-4" />
          公共大屏
        </a>
        <button
          onClick={toggle}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? '切换浅色' : '切换深色'}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-red-500 dark:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </div>
    </aside>
  )
}
