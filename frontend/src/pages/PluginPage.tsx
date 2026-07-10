import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { initPlugins, getPluginById } from '../plugins/registry'
import Logo from '../components/Logo'

export default function PluginPage() {
  const { pluginId } = useParams<{ pluginId: string }>()
  const [loading, setLoading] = useState(true)
  const [plugin, setPlugin] = useState<ReturnType<typeof getPluginById>>(undefined)

  useEffect(() => {
    // Ensure plugins are loaded before checking
    initPlugins().then(() => {
      setPlugin(pluginId ? getPluginById(pluginId) : undefined)
      setLoading(false)
    })
  }, [pluginId])

  if (loading) {
    return (
      <div className="landing-root">
        <nav className="landing-nav">
          <div className="landing-nav-inner">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="landing-nav-logo">
                <Logo className="text-emerald-400" size={18} />
              </div>
            </Link>
          </div>
        </nav>
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
          <p className="text-neutral-500">加载中...</p>
        </div>
      </div>
    )
  }

  if (!plugin) {
    return (
      <div className="landing-root">
        <nav className="landing-nav">
          <div className="landing-nav-inner">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="landing-nav-logo">
                <Logo className="text-emerald-400" size={18} />
              </div>
            </Link>
          </div>
        </nav>
        <div className="flex flex-col items-center justify-center py-32">
          <p className="text-neutral-500 mb-4">插件不存在或已禁用</p>
          <Link to="/" className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors">
            返回首页
          </Link>
        </div>
      </div>
    )
  }

  const PluginComponent = plugin.component

  return (
    <div className="landing-root">
      {/* Nav with back link */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="landing-nav-logo">
              <Logo className="text-emerald-400" size={18} />
            </div>
            <ArrowLeft className="w-4 h-4 text-neutral-500" />
            <span className="text-sm text-neutral-400">返回首页</span>
          </Link>
        </div>
      </nav>

      <PluginComponent />

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="flex items-center gap-2">
            <Logo className="text-neutral-600" size={16} />
            <span className="text-xs text-neutral-600">AI 驱动</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
