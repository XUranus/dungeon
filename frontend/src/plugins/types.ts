import type { ComponentType } from 'react'

/** Plugin metadata from manifest.json */
export interface PluginMeta {
  id: string
  name: string
  icon: string
  description: string
  order: number
}

/** Full plugin definition exported by index.tsx */
export interface Plugin {
  meta: PluginMeta
  component: ComponentType
}

/** Plugin runtime info from backend */
export interface PluginRuntimeInfo {
  id: string
  name: string
  icon: string
  description: string
  order: number
  enabled: boolean
  has_config: boolean
  has_hooks: boolean
}

/** Plugin event log entry */
export interface PluginEventLogEntry {
  event: string
  plugin_id: string
  status: 'ok' | 'error' | 'skipped'
  message: string
  duration_ms: number
  timestamp: number
}
