import type { Plugin, PluginMeta } from './types'

// Plugin registry with auto-discovery via Vite import.meta.glob.
// To add a new plugin:
//   1. Create src/plugins/<name>/manifest.json (metadata)
//   2. Create src/plugins/<name>/index.tsx (default export Plugin object)
// No other files need to be modified.

const _plugins: Plugin[] = []
let _loaded = false
let _loadPromise: Promise<void> | null = null

async function bootstrap() {
  if (_loaded) return
  _loaded = true

  const pluginModules = import.meta.glob<{ default: Plugin }>('./*/index.tsx')

  const entries = Object.entries(pluginModules)

  const loaded = await Promise.allSettled(
    entries.map(async ([path, loader]) => {
      try {
        const mod = await loader()
        const plugin = mod.default
        if (!plugin?.meta?.id || !plugin?.component) {
          console.warn(`[plugins] skip invalid plugin ${path}: missing meta.id or component`)
          return null
        }
        return plugin
      } catch (err) {
        console.error(`[plugins] failed to load ${path}:`, err)
        return null
      }
    })
  )

  for (const result of loaded) {
    if (result.status === 'fulfilled' && result.value) {
      _plugins.push(result.value)
    }
  }

  _plugins.sort((a, b) => a.meta.order - b.meta.order)
  console.log(`[plugins] loaded ${_plugins.length} plugins: ${_plugins.map(p => p.meta.id).join(', ')}`)
}

/** Register a single plugin manually (not needed with auto-discovery) */
export function register(plugin: Plugin) {
  if (!_plugins.find(p => p.meta.id === plugin.meta.id)) {
    _plugins.push(plugin)
    _plugins.sort((a, b) => a.meta.order - b.meta.order)
  }
}

/** Initialize plugin system, returns loaded plugins */
export async function initPlugins(): Promise<Plugin[]> {
  if (!_loadPromise) {
    _loadPromise = bootstrap()
  }
  await _loadPromise
  return getRegisteredPlugins()
}

export function getRegisteredPlugins(): Plugin[] {
  return [..._plugins].sort((a, b) => a.meta.order - b.meta.order)
}

export function getPluginById(id: string): Plugin | undefined {
  return _plugins.find(p => p.meta.id === id)
}

/** All registered plugin metadata (without components) */
export function getAllPluginMetas(): PluginMeta[] {
  return _plugins.map(p => p.meta).sort((a, b) => a.order - b.order)
}
