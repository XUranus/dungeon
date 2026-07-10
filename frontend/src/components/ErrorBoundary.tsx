import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              页面出错了
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button
              onClick={this.handleReset}
              className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl px-6 py-2.5 text-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all"
            >
              返回首页
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
