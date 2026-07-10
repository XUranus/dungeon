"""Plugin runtime API — config, storage, event logs."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import verify_api_key
from app.plugins.runtime import runtime
from app.config import settings

logger = logging.getLogger(__name__)

# Admin endpoints (require auth)
router = APIRouter(prefix="/api/plugins", tags=["plugins"], dependencies=[Depends(verify_api_key)])

# Public endpoints (no auth)
public_router = APIRouter(prefix="/api/plugins", tags=["plugins"])


# ── Models ──

class PluginListItem(BaseModel):
    id: str
    name: str
    icon: str
    description: str
    order: int
    enabled: bool
    has_config: bool
    has_hooks: bool


class PluginConfigResponse(BaseModel):
    plugin_id: str
    config: dict
    defaults: dict


class PluginConfigUpdateRequest(BaseModel):
    config: dict = Field(description="Config fields to merge-patch")


class EventReportRequest(BaseModel):
    plugin_id: str
    event: str
    status: str = "ok"
    message: str = ""


class DataWriteRequest(BaseModel):
    content: str


# ── Public endpoints ──

@public_router.get("/config/{plugin_id}")
async def get_plugin_config_public(plugin_id: str):
    """Get plugin config (public, for plugin components to read their own config)."""
    plugin = runtime.get_plugin(plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")
    return {
        "plugin_id": plugin_id,
        "config": runtime.get_config(plugin_id),
        "defaults": runtime.get_config_defaults(plugin_id),
    }


@public_router.post("/events/report")
async def report_event_public(req: EventReportRequest):
    """Plugin reports an event execution (public, for plugin components)."""
    plugin = runtime.get_plugin(req.plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {req.plugin_id}")
    runtime.report_event(req.plugin_id, req.event, req.status, req.message)
    return {"ok": True}


# ── Admin endpoints ──

@router.get("/", response_model=list[PluginListItem])
async def list_plugins():
    """List all plugins with runtime info."""
    enabled = set(settings.enabled_public_plugins)
    result = []
    for p in runtime.get_all_plugins():
        config = runtime.get_config(p["id"])
        result.append(PluginListItem(
            id=p["id"],
            name=p["name"],
            icon=p["icon"],
            description=p["description"],
            order=p["order"],
            enabled=p["id"] in enabled,
            has_config=bool(config),
            has_hooks=bool(p.get("hooks")),
        ))
    return result


@router.get("/config/{plugin_id}", response_model=PluginConfigResponse)
async def get_plugin_config(plugin_id: str):
    """Get plugin config with defaults."""
    plugin = runtime.get_plugin(plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")
    return PluginConfigResponse(
        plugin_id=plugin_id,
        config=runtime.get_config(plugin_id),
        defaults=runtime.get_config_defaults(plugin_id),
    )


@router.put("/config/{plugin_id}", response_model=PluginConfigResponse)
async def update_plugin_config(plugin_id: str, req: PluginConfigUpdateRequest):
    """Update plugin config (merge-patch)."""
    plugin = runtime.get_plugin(plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")
    updated = runtime.update_config(plugin_id, req.config)

    # 插件配置变更时同步相关系统设置
    if plugin_id == "recent-insights":
        patch = {}
        if "interval_minutes" in req.config:
            patch["insight_report_interval_minutes"] = req.config["interval_minutes"]
        if "ndays" in req.config:
            patch["insight_report_ndays"] = req.config["ndays"]
        if patch:
            settings.update(patch)
            logger.info("recent-insights 配置已同步到全局设置: %s", patch)
            # 热更新调度器
            if "insight_report_interval_minutes" in patch:
                logger.info("调用 apply_insight_report_interval(%d)", patch["insight_report_interval_minutes"])
                from app.utils.scheduler import apply_insight_report_interval
                apply_insight_report_interval(patch["insight_report_interval_minutes"])

    return PluginConfigResponse(
        plugin_id=plugin_id,
        config=updated,
        defaults=runtime.get_config_defaults(plugin_id),
    )


@router.get("/events")
async def get_event_log(plugin_id: str | None = None, event: str | None = None, limit: int = 100):
    """Get plugin event execution log."""
    return runtime.get_event_log(plugin_id=plugin_id, event=event, limit=min(limit, 500))


@router.post("/events/report")
async def report_event(req: EventReportRequest):
    """Plugin reports an event execution (admin auth)."""
    plugin = runtime.get_plugin(req.plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {req.plugin_id}")
    runtime.report_event(req.plugin_id, req.event, req.status, req.message)
    return {"ok": True}


@router.get("/data/{plugin_id}/{path:path}")
async def read_plugin_data(plugin_id: str, path: str):
    """Read a file from plugin's data directory."""
    plugin = runtime.get_plugin(plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")
    try:
        content = runtime.read_data(plugin_id, path)
        if content is None:
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
        return {"path": path, "content": content}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.put("/data/{plugin_id}/{path:path}")
async def write_plugin_data(plugin_id: str, path: str, req: DataWriteRequest):
    """Write a file to plugin's data directory."""
    plugin = runtime.get_plugin(plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")
    try:
        runtime.write_data(plugin_id, path, req.content)
        return {"ok": True, "path": path}
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
