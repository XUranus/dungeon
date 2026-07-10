---
sidebar_position: 2
slug: /plugins/development
title: Plugin Development Guide
description: Step-by-step guide to creating, configuring, and deploying custom plugins
keywords: [plugin, development, tutorial, custom plugin,二次开发]
---

# Plugin Development Guide

This guide walks through creating a new plugin from scratch. By the end you'll have
a fully functional plugin with its own page, configuration, event hooks, and admin panel.

---

## Quick Start (5 Minutes)

### 1. Create the Directory

```bash
mkdir -p frontend/src/plugins/my-plugin
```

### 2. Create `manifest.json`

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "icon": "Sparkles",
  "description": "A custom plugin that does amazing things",
  "order": 30,
  "config_defaults": {
    "greeting": "Hello from my plugin!",
    "max_items": 10
  },
  "hooks": {
    "topic_created": "Log when new topics arrive"
  }
}
```

### 3. Create `index.tsx`

```tsx
import { useState, useEffect } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { fetchPluginConfigPublic, reportPluginEvent } from '../../services/api'
import type { Plugin } from '../types'

function MyPluginPage() {
  const { isAdmin } = useAuth()
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPluginConfigPublic('my-plugin')
      .then((data) => setConfig(data.config))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="landing-plugin-page">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="landing-plugin-page">
      <div className="landing-plugin-header">
        <Sparkles className="w-5 h-5 text-emerald-400" />
        <h1 className="landing-plugin-title">My Plugin</h1>
        <span className="landing-plugin-desc">Amazing things</span>
      </div>

      <div className="p-6 rounded-lg bg-neutral-900/50 border border-neutral-800">
        <p className="text-neutral-300">{String(config.greeting)}</p>
        <p className="text-sm text-neutral-500 mt-2">
          Max items: {String(config.max_items)}
        </p>
      </div>

      {isAdmin && (
        <div className="landing-plugin-admin">
          <div className="landing-plugin-admin-header">
            <span className="landing-plugin-admin-title">Admin Panel</span>
          </div>
          <p className="text-sm text-neutral-400">
            Plugin-specific admin controls go here.
          </p>
        </div>
      )}
    </div>
  )
}

const plugin: Plugin = {
  meta: {
    id: 'my-plugin',
    name: 'My Plugin',
    icon: 'Sparkles',
    description: 'A custom plugin that does amazing things',
    order: 30,
  },
  component: MyPluginPage,
}

export default plugin
```

### 4. Build and Test

```bash
cd frontend && npm run build
```

Restart the backend. The plugin appears automatically in:
- Admin Settings > Plugins (config editor + event log)
- Public dashboard navbar (if enabled)
- `/p/my-plugin` (direct URL)

**No other files need to be modified.**

---

## manifest.json Reference

```json
{
  "id": "string (required)",
  "name": "string (required)",
  "icon": "string (required, lucide-react icon name)",
  "description": "string (required)",
  "order": "number (required, lower = left in navbar)",
  "config_defaults": {},
  "hooks": {}
}
```

### Field Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier. Used in URL `/p/{id}`, config path `data/plugins/{id}/`, and `enabled_public_plugins`. Use kebab-case. |
| `name` | string | yes | Display name shown in navbar Tab and admin settings. |
| `icon` | string | yes | [lucide-react](https://lucide.dev) icon name. Common: `TrendingUp`, `MessageSquare`, `Sparkles`, `BarChart3`, `Globe`. |
| `description` | string | yes | One-line description shown in admin settings. |
| `order` | number | yes | Sort weight for navbar ordering. Lower numbers appear left. Use increments of 10 (10, 20, 30...). |
| `config_defaults` | object | no | Default configuration values. Auto-persisted to `data/plugins/{id}/config.json` on first run. |
| `hooks` | object | no | Event hooks. Keys are event names, values are human-readable descriptions. |

### Available Icons

Commonly used lucide-react icons:

| Icon | Use Case |
|------|----------|
| `TrendingUp` | Charts, analytics, indices |
| `MessageSquare` | Chat, messages, insights |
| `Sparkles` | AI, magic, new features |
| `BarChart3` | Statistics, dashboards |
| `Globe` | International, web, global |
| `Database` | Data, storage, crawl |
| `Bot` | AI agents, automation |
| `Activity` | Monitoring, live data |
| `Zap` | Fast, performance |
| `Shield` | Security, admin |

---

## Plugin Component API

### useAuth Hook

Check if the current user is an admin:

```tsx
import { useAuth } from '../../contexts/AuthContext'

function MyPage() {
  const { isAdmin, token, login, logout } = useAuth()

  return (
    <div>
      {isAdmin ? <AdminPanel /> : <PublicView />}
    </div>
  )
}
```

| Property | Type | Description |
|----------|------|-------------|
| `isAdmin` | `boolean` | `true` if user has a valid API key |
| `token` | `string \| null` | Current API key (null if not logged in) |
| `login` | `(key: string) => Promise<void>` | Authenticate with an API key |
| `logout` | `() => void` | Clear stored API key |

### API Functions

All functions from `src/services/api.ts` are available:

```tsx
import {
  // Main system data
  fetchDashboardSummary,
  fetchDashboardStats,
  fetchProfessorIndex,
  fetchTopics,
  // Plugin-specific
  fetchPluginConfigPublic,
  reportPluginEvent,
} from '../../services/api'
```

### Reporting Events

```tsx
import { reportPluginEvent } from '../../services/api'

// Report a successful operation
await reportPluginEvent('my-plugin', 'data_sync', 'ok', 'Synced 100 items')

// Report an error
await reportPluginEvent('my-plugin', 'data_sync', 'error', 'API timeout')
```

---

## CSS Classes

### Page Layout

| Class | Description |
|-------|-------------|
| `.landing-plugin-page` | Page container. Max-width 1100px, centered, padding 40px 20px 60px. |
| `.landing-plugin-header` | Header row with icon, title, and description. |
| `.landing-plugin-title` | Title text (22px, bold, light gray). |
| `.landing-plugin-desc` | Right-aligned description text (13px, dark gray). |

### Admin Panel

| Class | Description |
|-------|-------------|
| `.landing-plugin-admin` | Admin section container. Top border separator, margin-top 48px. |
| `.landing-plugin-admin-header` | Title row with icon and text. |
| `.landing-plugin-admin-title` | "Admin Panel" title text. |
| `.landing-plugin-admin-section` | Section within admin panel. |
| `.landing-plugin-admin-label` | Section label. |
| `.landing-plugin-admin-options` | 4-column grid for option buttons. |
| `.landing-plugin-admin-option` | Option button (dark bg, hover highlight). |
| `.landing-plugin-admin-option-active` | Selected option (green tint). |
| `.landing-plugin-admin-btn` | Action button (green). |
| `.landing-plugin-admin-status` | Status text. |
| `.landing-plugin-admin-status-ok` | Success status (green). |
| `.landing-plugin-admin-table-wrap` | Table scroll container. |
| `.landing-plugin-admin-table` | Styled table. |

### Status Tags

| Class | Color |
|-------|-------|
| `.landing-plugin-tag` | Default (gray) |
| `.landing-plugin-tag-green` | Green (success) |
| `.landing-plugin-tag-red` | Red (error) |
| `.landing-plugin-tag-blue` | Blue (info) |
| `.landing-plugin-tag-amber` | Amber (warning) |

### Example: Admin Options Grid

```tsx
<div className="landing-plugin-admin-options">
  {options.map((opt) => (
    <button
      key={opt.value}
      onClick={() => handleSelect(opt.value)}
      className={`landing-plugin-admin-option ${
        selected === opt.value ? 'landing-plugin-admin-option-active' : ''
      }`}
    >
      {opt.label}
    </button>
  ))}
</div>
```

---

## Event Hooks

### Available Events

| Event | When Fired | Payload |
|-------|-----------|---------|
| `crawl_completed` | Crawl task finishes | `(task_id: int, platform: str, new_topics: int)` |
| `topic_created` | New topic inserted | `(topic_id: int, platform: str, content_type: str)` |
| `topic_updated` | Topic modified | `(topic_id: int, fields: list[str])` |
| `message_received` | Public chat message | `(visitor_id: str, message: str)` |

### Declaring Hooks

In `manifest.json`, declare which events your plugin cares about:

```json
{
  "hooks": {
    "crawl_completed": "Re-analyze holdings when new articles arrive",
    "topic_created": "Update real-time feed counter"
  }
}
```

The description is informational only — it appears in admin settings.

### Registering Handlers

Currently, hook handlers are registered in backend Python code. To add a handler
for your plugin, edit `backend/app/plugins/runtime.py`:

```python
def _wire_event_hooks(self):
    """Register event hooks declared in manifests."""
    from app.plugins.events import event_bus

    for plugin_id, manifest in self.plugins.items():
        hooks = manifest.get("hooks", {})
        for event_name in hooks:
            if plugin_id == "my-plugin" and event_name == "crawl_completed":
                event_bus.on(event_name, plugin_id, self._my_hook_handler)

def _my_hook_handler(self, **kwargs):
    """Handler for my-plugin's crawl_completed hook."""
    logger.info("my-plugin: crawl completed, kwargs=%s", kwargs)
    # Do something...
    return "processed"
```

### Querying Event Logs

```ts
// In admin settings, event logs are shown automatically when expanding a plugin
// You can also query programmatically:
const logs = await fetchPluginEventLog({ plugin_id: 'my-plugin', limit: 50 })
```

---

## Configuration

### Defining Defaults

```json
{
  "config_defaults": {
    "enabled": true,
    "refresh_interval": 60,
    "display_mode": "grid",
    "columns": ["name", "value", "change"]
  }
}
```

### Reading Config in Component

```tsx
import { fetchPluginConfigPublic } from '../../services/api'

useEffect(() => {
  fetchPluginConfigPublic('my-plugin')
    .then((data) => {
      console.log('Current config:', data.config)
      console.log('Defaults:', data.defaults)
    })
}, [])
```

### Config Storage

Config is stored at `data/plugins/<id>/config.json`:

```json
{
  "enabled": true,
  "refresh_interval": 60,
  "display_mode": "grid",
  "columns": ["name", "value", "change"]
}
```

Admin can edit this in Settings > Plugins > expand plugin > Config (JSON).

---

## Plugin Data Storage

### Reading Data

```python
# Backend
content = runtime.read_data("my-plugin", "cache.json")
```

```ts
// Frontend (via API)
const res = await fetch('/api/plugins/data/my-plugin/cache.json', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
})
const { content } = await res.json()
```

### Writing Data

```python
# Backend
runtime.write_data("my-plugin", "cache.json", json.dumps(data))
```

```ts
// Frontend (via API)
await fetch('/api/plugins/data/my-plugin/cache.json', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ content: jsonString }),
})
```

### Security

- Path traversal (`../`) is blocked
- Each plugin can only access its own `data/plugins/<id>/` directory
- Admin authentication required for all data operations

---

## Real-World Example: professor-index

The `professor-index` plugin demonstrates all features:

```
src/plugins/professor-index/
├── manifest.json          # config_defaults + hooks
└── index.tsx              # Component with admin panel
```

### manifest.json

```json
{
  "id": "professor-index",
  "name": "教授指数",
  "icon": "TrendingUp",
  "description": "展示持仓配置（内地版/全球版），含环形图与参考文章",
  "order": 10,
  "config_defaults": {
    "auto_parse_enabled": true,
    "auto_parse_interval_days": 7,
    "show_donut_chart": true,
    "max_holdings_display": 20
  },
  "hooks": {
    "crawl_completed": "自动触发教授指数解析（当新文章被抓取时）"
  }
}
```

### Component Structure

```tsx
function ProfessorIndexPage() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState<ProfessorIndexData>({})

  useEffect(() => {
    fetchProfessorIndex().then(setData)  // calls main system API
  }, [])

  return (
    <div className="landing-plugin-page">
      <div className="landing-plugin-header">...</div>

      {/* Public: portfolio cards with donut charts */}
      <div className="landing-portfolio-grid">
        {versions.map((ver) => <PortfolioCard key={ver} data={data[ver]} />)}
      </div>

      {/* Admin: interval config, manual trigger, parse history */}
      {isAdmin && <AdminPanel />}
    </div>
  )
}
```

### What It Does

| Feature | Implementation |
|---------|---------------|
| Data display | Calls `fetchProfessorIndex()` (main system API) |
| Config | Reads `auto_parse_interval_days` from plugin config |
| Admin panel | Shows interval selector, trigger button, parse history |
| Event hook | Declared for `crawl_completed` (auto-parse trigger) |
| Storage | Uses `data/plugins/professor-index/config.json` |

---

## Checklist: Adding a New Plugin

- [ ] Create `frontend/src/plugins/<name>/manifest.json`
- [ ] Create `frontend/src/plugins/<name>/index.tsx`
- [ ] Add `config_defaults` for any configurable values
- [ ] Add `hooks` for any events the plugin cares about
- [ ] Use `useAuth()` to conditionally show admin controls
- [ ] Use `fetchPluginConfigPublic()` to read config at runtime
- [ ] Use `reportPluginEvent()` to report execution results
- [ ] Use `landing-plugin-*` CSS classes for consistent styling
- [ ] Run `npm run build` to verify
- [ ] Restart backend (auto-discovers on startup)
- [ ] Enable in Admin Settings > Plugins
- [ ] Verify at `/p/<name>`
