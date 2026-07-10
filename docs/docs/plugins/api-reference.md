---
sidebar_position: 3
slug: /plugins/api
title: Plugin API Reference
description: Complete REST API reference for the plugin runtime system
keywords: [plugin, API, REST, config, events, storage]
---

# Plugin API Reference

Complete reference for all plugin-related REST endpoints.

---

## Authentication

| Endpoint Group | Auth | Header |
|---------------|------|--------|
| Public | None | — |
| Admin | API Key | `Authorization: Bearer <api_key>` |

---

## Public Endpoints

### List Enabled Plugins

```
GET /api/dashboard/plugins
```

Returns the list of enabled plugins for the public navbar.

**Response:**
```json
{
  "plugins": [
    {
      "id": "professor-index",
      "name": "教授指数",
      "icon": "TrendingUp",
      "description": "展示持仓配置...",
      "order": 10
    }
  ]
}
```

### Read Plugin Config (Public)

```
GET /api/plugins/config/{plugin_id}
```

Read-only access to plugin config. Used by plugin components to read their own
configuration without admin auth.

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `plugin_id` | path | Plugin ID (e.g. `professor-index`) |

**Response:**
```json
{
  "plugin_id": "professor-index",
  "config": {
    "auto_parse_enabled": true,
    "auto_parse_interval_days": 7,
    "show_donut_chart": true,
    "max_holdings_display": 20
  },
  "defaults": {
    "auto_parse_enabled": true,
    "auto_parse_interval_days": 7,
    "show_donut_chart": true,
    "max_holdings_display": 20
  }
}
```

**Errors:**
| Status | Description |
|--------|-------------|
| 404 | Plugin not found |

### Report Plugin Event

```
POST /api/plugins/events/report
```

Plugin component reports an event execution. Used for frontend-initiated tracking.

**Request Body:**
```json
{
  "plugin_id": "my-plugin",
  "event": "data_sync",
  "status": "ok",
  "message": "Synced 100 items"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plugin_id` | string | yes | Plugin ID |
| `event` | string | yes | Event name |
| `status` | string | no | `"ok"` (default), `"error"`, or `"skipped"` |
| `message` | string | no | Human-readable message (max 200 chars) |

**Response:**
```json
{ "ok": true }
```

---

## Admin Endpoints

All admin endpoints require `Authorization: Bearer <api_key>` header.

### List All Plugins (with Runtime Info)

```
GET /api/plugins/
```

Returns all discovered plugins with runtime metadata.

**Response:**
```json
[
  {
    "id": "professor-index",
    "name": "教授指数",
    "icon": "TrendingUp",
    "description": "展示持仓配置...",
    "order": 10,
    "enabled": true,
    "has_config": true,
    "has_hooks": true
  },
  {
    "id": "recent-insights",
    "name": "近期观点",
    "icon": "MessageSquare",
    "description": "展示最新市场动态...",
    "order": 20,
    "enabled": true,
    "has_config": true,
    "has_hooks": true
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Plugin identifier |
| `name` | string | Display name |
| `icon` | string | lucide-react icon name |
| `description` | string | One-line description |
| `order` | number | Sort weight |
| `enabled` | boolean | Whether plugin is enabled in navbar |
| `has_config` | boolean | Whether plugin has a config file |
| `has_hooks` | boolean | Whether plugin declares event hooks |

### Read Plugin Config (Admin)

```
GET /api/plugins/config/{plugin_id}
```

Same as public endpoint but with admin auth. Returns config and defaults.

### Update Plugin Config

```
PUT /api/plugins/config/{plugin_id}
```

Merge-patch plugin config. Only provided fields are updated; others are preserved.

**Request Body:**
```json
{
  "config": {
    "show_donut_chart": false,
    "max_holdings_display": 50
  }
}
```

**Response:**
```json
{
  "plugin_id": "professor-index",
  "config": {
    "auto_parse_enabled": true,
    "auto_parse_interval_days": 7,
    "show_donut_chart": false,
    "max_holdings_display": 50
  },
  "defaults": {
    "auto_parse_enabled": true,
    "auto_parse_interval_days": 7,
    "show_donut_chart": true,
    "max_holdings_display": 20
  }
}
```

**Errors:**
| Status | Description |
|--------|-------------|
| 404 | Plugin not found |

### Get Event Log

```
GET /api/plugins/events
```

Query plugin event execution history.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `plugin_id` | string | — | Filter by plugin ID |
| `event` | string | — | Filter by event name |
| `limit` | int | 100 | Max entries to return (max 500) |

**Response:**
```json
[
  {
    "event": "crawl_completed",
    "plugin_id": "professor-index",
    "status": "ok",
    "message": "Parsed: 3 china, 2 global",
    "duration_ms": 1234,
    "timestamp": 1703980800.123
  },
  {
    "event": "data_sync",
    "plugin_id": "my-plugin",
    "status": "error",
    "message": "API timeout after 30s",
    "duration_ms": 30000,
    "timestamp": 1703980700.456
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event name |
| `plugin_id` | string | Plugin that handled/reported the event |
| `status` | string | `"ok"`, `"error"`, or `"skipped"` |
| `message` | string | Result message (max 200 chars) |
| `duration_ms` | int | Handler execution time in milliseconds |
| `timestamp` | float | Unix timestamp (seconds) |

### Report Plugin Event (Admin)

```
POST /api/plugins/events/report
```

Same as public endpoint but with admin auth.

### Read Plugin Data File

```
GET /api/plugins/data/{plugin_id}/{path}
```

Read a file from a plugin's data directory.

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `plugin_id` | path | Plugin ID |
| `path` | path | Relative file path (e.g. `cache.json`) |

**Response:**
```json
{
  "path": "cache.json",
  "content": "{\"items\": [...], \"updated\": \"2024-01-01\"}"
}
```

**Errors:**
| Status | Description |
|--------|-------------|
| 403 | Path traversal blocked |
| 404 | Plugin or file not found |

### Write Plugin Data File

```
PUT /api/plugins/data/{plugin_id}/{path}
```

Write a file to a plugin's data directory. Creates parent directories as needed.

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `plugin_id` | path | Plugin ID |
| `path` | path | Relative file path |

**Request Body:**
```json
{
  "content": "{\"items\": [...], \"updated\": \"2024-01-01\"}"
}
```

**Response:**
```json
{
  "ok": true,
  "path": "cache.json"
}
```

**Errors:**
| Status | Description |
|--------|-------------|
| 403 | Path traversal blocked |
| 404 | Plugin not found |

---

## Plugin Management (Settings Router)

These endpoints are under `/api/settings/` and manage plugin enable/disable state.

### List Plugins with Enable Status

```
GET /api/settings/public-plugins
```

**Auth:** Admin

**Response:**
```json
{
  "plugins": [
    {
      "id": "professor-index",
      "name": "教授指数",
      "icon": "TrendingUp",
      "description": "...",
      "order": 10,
      "enabled": true
    }
  ]
}
```

### Update Enabled Plugins

```
PUT /api/settings/public-plugins
```

**Auth:** Admin

**Request Body:**
```json
{
  "enabled_ids": ["professor-index", "recent-insights"]
}
```

**Response:**
```json
{
  "enabled_ids": ["professor-index", "recent-insights"]
}
```

Only valid plugin IDs (from scanned manifests) are accepted. Invalid IDs are silently ignored.

---

## Event Bus (Internal)

These are internal Python APIs, not REST endpoints. Documented for backend extension.

### EventBus API

```python
from app.plugins.events import event_bus

# Register a hook handler
event_bus.on("crawl_completed", "my-plugin", my_handler)

# Emit an event (sync)
entries = event_bus.emit_sync("crawl_completed", task_id=42)

# Emit an event (async)
entries = await event_bus.emit("crawl_completed", task_id=42)

# Manual report
event_bus.report("my-plugin", "custom_event", "ok", "All good")

# Query log
log = event_bus.get_log(plugin_id="my-plugin", event="crawl_completed", limit=50)
```

### Handler Signature

```python
# Sync handler
def my_handler(task_id: int = 0, **kwargs) -> str:
    # Process event...
    return "processed 5 items"  # logged as message

# Async handler
async def my_handler(task_id: int = 0, **kwargs) -> str:
    # Process event...
    return "processed 5 items"
```

### Runtime API

```python
from app.plugins.runtime import runtime

# Initialize (called at app startup)
runtime.init()

# Plugin queries
runtime.get_all_plugins()                    # list[dict]
runtime.get_plugin("professor-index")        # dict | None
runtime.get_enabled_plugins()                # list[dict]

# Config
runtime.get_config("professor-index")        # dict
runtime.get_config_defaults("professor-index")  # dict
runtime.update_config("professor-index", {"key": "value"})

# Storage
runtime.get_data_dir("professor-index")      # Path
runtime.read_data("professor-index", "x.json")  # str | None
runtime.write_data("professor-index", "x.json", "content")

# Events
runtime.emit_event("crawl_completed", task_id=42)
runtime.report_event("my-plugin", "custom", "ok", "done")
runtime.get_event_log(plugin_id="my-plugin", limit=50)
```

---

## Event Reference

| Event | Fired By | Payload kwargs |
|-------|----------|---------------|
| `crawl_completed` | `app/routers/sources.py` | `task_id`, `platform`, `new_topics` |
| `topic_created` | `app/services/ingestion.py` | `topic_id`, `platform`, `content_type` |
| `topic_updated` | `app/routers/topics.py` | `topic_id`, `fields` |
| `message_received` | `app/routers/dashboard.py` | `visitor_id`, `message` |

---

## Error Responses

All endpoints return standard FastAPI error format:

```json
{
  "detail": "Plugin not found: unknown-plugin"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (invalid JSON, missing fields) |
| 401 | Unauthorized (missing or invalid API key) |
| 403 | Forbidden (path traversal attempt) |
| 404 | Not found (plugin or file) |
| 429 | Rate limited |
| 500 | Internal server error |

---

## Curl Examples

```bash
KEY="your-api-key"

# List all plugins
curl -H "Authorization: Bearer $KEY" http://localhost:8000/api/plugins/

# Get plugin config
curl -H "Authorization: Bearer $KEY" http://localhost:8000/api/plugins/config/professor-index

# Update config
curl -X PUT -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"config": {"show_donut_chart": false}}' \
  http://localhost:8000/api/plugins/config/professor-index

# Get event log
curl -H "Authorization: Bearer $KEY" \
  "http://localhost:8000/api/plugins/events?plugin_id=professor-index&limit=20"

# Report event
curl -X POST -H "Content-Type: application/json" \
  -d '{"plugin_id":"my-plugin","event":"test","status":"ok","message":"works"}' \
  http://localhost:8000/api/plugins/events/report

# Read plugin data
curl -H "Authorization: Bearer $KEY" \
  http://localhost:8000/api/plugins/data/professor-index/config.json

# Write plugin data
curl -X PUT -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "{\"key\": \"value\"}"}' \
  http://localhost:8000/api/plugins/data/my-plugin/cache.json
```
