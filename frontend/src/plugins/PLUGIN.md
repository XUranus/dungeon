# Plugin Development Convention

## Overview

Plugin system with auto-discovery, runtime management, event hooks, per-plugin config, and isolated storage.

## Directory Structure

```
src/plugins/
  my-plugin/
    manifest.json     # required - metadata + config defaults + hooks
    index.tsx          # required - default export Plugin object
    *.tsx / *.ts       # optional - components, utils
```

## manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "icon": "TrendingUp",
  "description": "One-line description for admin settings page",
  "order": 10,
  "config_defaults": {
    "enabled": true,
    "limit": 30
  },
  "hooks": {
    "crawl_completed": "Description of what this hook does",
    "topic_created": "Another hook description"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique ID, URL path `/p/{id}`, matches `enabled_public_plugins` |
| `name` | string | yes | Display name in navbar Tab |
| `icon` | string | yes | lucide-react icon name |
| `description` | string | yes | One-line description for admin page |
| `order` | number | yes | Sort weight (lower = left) |
| `config_defaults` | object | no | Default config values, persisted to `data/plugins/{id}/config.json` |
| `hooks` | object | no | Event hooks: `{ "event_name": "description" }` |

## index.tsx

```tsx
import type { Plugin } from '../types'

function MyPluginPage() {
  return <div className="landing-plugin-page">...</div>
}

const plugin: Plugin = {
  meta: {
    id: 'my-plugin',
    name: 'My Plugin',
    icon: 'TrendingUp',
    description: 'One-line description',
    order: 10,
  },
  component: MyPluginPage,
}

export default plugin
```

## Runtime Architecture

### Data Access

Plugins can call any main system API via `src/services/api.ts`:

```tsx
import { fetchDashboardSummary, fetchTopics } from '../../services/api'
```

### Storage

Each plugin gets an isolated data directory:

```
data/plugins/<plugin-id>/
  config.json          # auto-managed by runtime
  *.json / *.csv       # plugin's own data files
```

Backend endpoints for plugin data:
- `GET  /api/plugins/data/{id}/{path}` - read file
- `PUT  /api/plugins/data/{id}/{path}` - write file

Path traversal is blocked.

### Config

Per-plugin JSON config, auto-initialized from `config_defaults`:

- `GET  /api/plugins/config/{id}` - read config (public, for plugin components)
- `PUT  /api/plugins/config/{id}` - update config (admin, merge-patch)

Config is persisted to `data/plugins/{id}/config.json`.

### Event Hooks

Plugins can hook into main system events via `manifest.json`:

```json
{
  "hooks": {
    "crawl_completed": "Auto-parse professor index when new articles arrive",
    "topic_created": "Refresh insights list"
  }
}
```

Available events:
| Event | Fired when |
|-------|-----------|
| `crawl_completed` | A crawl task finishes |
| `topic_created` | A new topic is inserted |
| `topic_updated` | A topic is updated |
| `message_received` | A public chat message arrives |

### Event Reporting

Plugins report execution results back to the system:

```ts
import { reportPluginEvent } from '../../services/api'

// In your component or event handler:
await reportPluginEvent('my-plugin', 'data_sync', 'ok', 'Synced 50 records')
```

Event logs are viewable in Admin > Plugins > expand plugin > Event Log.

### Admin Panel (In-Plugin)

Plugins can show admin controls when user is logged in:

```tsx
import { useAuth } from '../../contexts/AuthContext'

function MyPluginPage() {
  const { isAdmin } = useAuth()

  return (
    <div className="landing-plugin-page">
      {/* Public content */}
      <PublicView />

      {/* Admin-only panel */}
      {isAdmin && <AdminPanel />}
    </div>
  )
}
```

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.landing-plugin-page` | Plugin page container (max-width 1100px, centered) |
| `.landing-plugin-header` | Page header (icon + title + description) |
| `.landing-plugin-title` | Title text |
| `.landing-plugin-desc` | Right-aligned description |
| `.landing-plugin-admin` | Admin panel container (top border separator) |
| `.landing-plugin-admin-header` | Admin panel title row |
| `.landing-plugin-admin-title` | Admin panel title text |
| `.landing-plugin-admin-section` | Admin panel section |
| `.landing-plugin-admin-label` | Section label |
| `.landing-plugin-admin-options` | Option button grid |
| `.landing-plugin-admin-option` | Option button |
| `.landing-plugin-admin-option-active` | Selected state |
| `.landing-plugin-admin-btn` | Action button (green) |
| `.landing-plugin-admin-table-wrap` | Table container |
| `.landing-plugin-admin-table` | Table |
| `.landing-plugin-tag` | Status tag |
| `.landing-plugin-tag-green/red/blue/amber` | Tag color variants |

## Adding a New Plugin

1. Create `src/plugins/my-plugin/manifest.json`
2. Create `src/plugins/my-plugin/index.tsx` (default export `Plugin`)
3. Optionally add `config_defaults` and `hooks` to manifest
4. Run `npm run build`
5. Restart backend

No changes to App.tsx, registry.ts, settings.py, or any other file needed.

## Routes

- Public page: `/p/{plugin-id}` (e.g. `/p/professor-index`)
- Navbar Tab: auto-generated from enabled plugins list
- Disabled plugins: still accessible via URL, hidden from navbar

## Backend API Summary

| Endpoint | Auth | Method | Description |
|----------|------|--------|-------------|
| `/api/dashboard/plugins` | public | GET | Enabled plugins list |
| `/api/plugins/` | admin | GET | All plugins with runtime info |
| `/api/plugins/config/{id}` | public | GET | Read plugin config |
| `/api/plugins/config/{id}` | admin | PUT | Update plugin config |
| `/api/plugins/events` | admin | GET | Event execution log |
| `/api/plugins/events/report` | public | POST | Plugin reports event |
| `/api/plugins/data/{id}/{path}` | admin | GET | Read plugin data file |
| `/api/plugins/data/{id}/{path}` | admin | PUT | Write plugin data file |
