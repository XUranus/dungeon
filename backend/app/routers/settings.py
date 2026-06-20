"""系统设置 API（仅管理员）"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_admin
from app.config import settings
from app.utils.scheduler import apply_crawl_interval, get_scheduler_status

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(get_current_admin)],
)

# 公开路由（无需登录）
public_router = APIRouter(prefix="/api/settings", tags=["settings"])


class CrawlIntervalRequest(BaseModel):
    minutes: int = Field(ge=0, le=1440, description="爬取间隔（分钟），0=关闭")


class CrawlIntervalResponse(BaseModel):
    minutes: int
    label: str


_INTERVAL_LABELS = {0: "关闭", 1: "每1分钟", 30: "每30分钟", 60: "每1小时"}


def _label_for(minutes: int) -> str:
    return _INTERVAL_LABELS.get(minutes, f"每{minutes}分钟")


@router.get("/crawl-interval", response_model=CrawlIntervalResponse)
async def read_crawl_interval():
    """获取当前爬取间隔"""
    m = settings.crawl_interval_minutes
    return CrawlIntervalResponse(minutes=m, label=_label_for(m))


@router.put("/crawl-interval", response_model=CrawlIntervalResponse)
async def update_crawl_interval(req: CrawlIntervalRequest):
    """设置爬取间隔（热更新，无需重启）"""
    settings.update({"crawl_interval_minutes": req.minutes})
    apply_crawl_interval(req.minutes)
    return CrawlIntervalResponse(minutes=req.minutes, label=_label_for(req.minutes))


@router.get("/scheduler")
async def scheduler_status():
    """查看调度器状态"""
    return get_scheduler_status()


# ── 系统信息（公开）──

class SystemInfoResponse(BaseModel):
    system_title: str
    system_subtitle: str


class SystemInfoRequest(BaseModel):
    system_title: str = Field(min_length=1, max_length=50)
    system_subtitle: str = Field(max_length=100)


@public_router.get("/system-info", response_model=SystemInfoResponse)
async def read_system_info():
    """获取系统名称和副标题（公开，无需登录）"""
    return SystemInfoResponse(
        system_title=settings.system_title,
        system_subtitle=settings.system_subtitle,
    )


@router.put("/system-info", response_model=SystemInfoResponse)
async def update_system_info(req: SystemInfoRequest):
    """更新系统名称和副标题（需管理员）"""
    settings.update({
        "system_title": req.system_title,
        "system_subtitle": req.system_subtitle,
    })
    return SystemInfoResponse(
        system_title=req.system_title,
        system_subtitle=req.system_subtitle,
    )


# ── 工具设置 ──

class ToolsSettingsResponse(BaseModel):
    enable_tools: bool
    tavily_api_key_set: bool  # 不暴露实际 key，只返回是否已设置


class ToolsSettingsRequest(BaseModel):
    enable_tools: bool | None = None
    tavily_api_key: str | None = None


@router.get("/tools", response_model=ToolsSettingsResponse)
async def read_tools_settings():
    """获取工具配置"""
    return ToolsSettingsResponse(
        enable_tools=settings.enable_tools,
        tavily_api_key_set=bool(settings.tavily_api_key),
    )


@router.put("/tools", response_model=ToolsSettingsResponse)
async def update_tools_settings(req: ToolsSettingsRequest):
    """更新工具配置"""
    patch: dict = {}
    if req.enable_tools is not None:
        patch["enable_tools"] = req.enable_tools
    if req.tavily_api_key is not None:
        patch["tavily_api_key"] = req.tavily_api_key
    if patch:
        settings.update(patch)
    return ToolsSettingsResponse(
        enable_tools=settings.enable_tools,
        tavily_api_key_set=bool(settings.tavily_api_key),
    )


# ── 日志级别 ──

_VALID_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


class LogLevelResponse(BaseModel):
    level: str


class LogLevelRequest(BaseModel):
    level: str = Field(description="日志级别: DEBUG / INFO / WARNING / ERROR / CRITICAL")


@router.get("/log-level", response_model=LogLevelResponse)
async def read_log_level():
    """获取当前日志级别"""
    level = logging.getLogger().level
    return LogLevelResponse(level=logging.getLevelName(level))


@router.put("/log-level", response_model=LogLevelResponse)
async def update_log_level(req: LogLevelRequest):
    """设置全局日志级别（热更新，无需重启）"""
    level_name = req.level.upper()
    if level_name not in _VALID_LEVELS:
        raise HTTPException(status_code=400, detail=f"无效级别，可选: {', '.join(sorted(_VALID_LEVELS))}")
    logging.getLogger().setLevel(getattr(logging, level_name))
    return LogLevelResponse(level=level_name)
