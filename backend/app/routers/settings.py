"""系统设置 API（仅管理员）"""

import json
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from app.auth import verify_api_key
from app.config import settings, PROJECT_ROOT
from app.utils.scheduler import apply_crawl_interval, get_scheduler_status

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(verify_api_key)],
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


class SystemAvatarResponse(BaseModel):
    avatar_url: str


class SystemAvatarRequest(BaseModel):
    avatar_url: str = Field(max_length=500, description="星主头像 URL，留空则使用默认")


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


# ── 星主信息（公开）──

class SystemOwnerResponse(BaseModel):
    owner_name: str
    avatar_url: str


class SystemOwnerNameRequest(BaseModel):
    owner_name: str = Field(max_length=50, description="星主名称")


@public_router.get("/system-owner", response_model=SystemOwnerResponse)
async def read_system_owner():
    """获取星主名称和头像（公开，无需登录）"""
    return SystemOwnerResponse(
        owner_name=settings.system_owner_name,
        avatar_url=settings.system_avatar_url,
    )


@router.put("/system-owner-name", response_model=SystemOwnerNameRequest)
async def update_system_owner_name(req: SystemOwnerNameRequest):
    """更新星主名称（需管理员）"""
    settings.update({"system_owner_name": req.owner_name})
    return req


# ── 星主头像（公开）──

@public_router.get("/system-avatar", response_model=SystemAvatarResponse)
async def read_system_avatar():
    """获取星主头像 URL（公开，无需登录）"""
    return SystemAvatarResponse(avatar_url=settings.system_avatar_url)


@router.put("/system-avatar", response_model=SystemAvatarResponse)
async def update_system_avatar(req: SystemAvatarRequest):
    """更新星主头像 URL（需管理员）"""
    settings.update({"system_avatar_url": req.avatar_url})
    return SystemAvatarResponse(avatar_url=req.avatar_url)


UPLOAD_DIR = PROJECT_ROOT / "data" / "uploads"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
MAX_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/system-avatar/upload", response_model=SystemAvatarResponse)
async def upload_system_avatar(file: UploadFile = File(...)):
    """上传星主头像文件（需管理员）"""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {file.content_type}，支持: jpg/png/gif/webp/svg")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail=f"文件过大: {len(data) / 1024 / 1024:.1f}MB，最大 5MB")

    # 确定扩展名
    ext_map = {
        "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
        "image/webp": ".webp", "image/svg+xml": ".svg",
    }
    ext = ext_map.get(file.content_type, ".jpg")

    # 保存文件
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filename = f"avatar_{uuid.uuid4().hex[:12]}{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(data)

    # 更新配置
    avatar_url = f"/api/uploads/{filename}"
    settings.update({"system_avatar_url": avatar_url})
    logger.info("头像已上传: %s", filename)
    return SystemAvatarResponse(avatar_url=avatar_url)


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


# ── 公共插件管理 ──

# 插件目录：frontend/src/plugins/
_PLUGINS_DIR = PROJECT_ROOT / "frontend" / "src" / "plugins"


def _scan_plugins() -> list[dict]:
    """自动扫描插件目录，读取每个插件的 manifest.json"""
    plugins = []
    if not _PLUGINS_DIR.is_dir():
        logger.warning("插件目录不存在: %s", _PLUGINS_DIR)
        return plugins

    for entry in sorted(_PLUGINS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        manifest_path = entry / "manifest.json"
        if not manifest_path.exists():
            continue
        try:
            data = json.loads(manifest_path.read_text("utf-8"))
            # 校验必填字段
            required = ("id", "name", "icon", "description", "order")
            if not all(k in data for k in required):
                logger.warning("插件 manifest 缺少必填字段 %s: %s", entry.name, manifest_path)
                continue
            plugins.append({
                "id": data["id"],
                "name": data["name"],
                "icon": data["icon"],
                "description": data["description"],
                "order": int(data["order"]),
            })
        except Exception as e:
            logger.error("读取插件 manifest 失败 %s: %s", manifest_path, e)

    plugins.sort(key=lambda p: p["order"])
    logger.info("已扫描到 %d 个插件: %s", len(plugins), [p["id"] for p in plugins])
    return plugins


# 启动时扫描一次，缓存结果
REGISTERED_PLUGINS: list[dict] = _scan_plugins()


class PluginItem(BaseModel):
    id: str
    name: str
    icon: str
    description: str
    order: int
    enabled: bool


class PublicPluginsResponse(BaseModel):
    plugins: list[PluginItem]


class UpdatePluginsRequest(BaseModel):
    enabled_ids: list[str] = Field(description="要启用的插件 ID 列表")


@router.get("/public-plugins", response_model=PublicPluginsResponse)
async def read_public_plugins():
    """获取所有公共插件及其启用状态（需管理员）"""
    enabled = set(settings.enabled_public_plugins)
    plugins = [
        PluginItem(**p, enabled=p["id"] in enabled)
        for p in sorted(REGISTERED_PLUGINS, key=lambda x: x["order"])
    ]
    return PublicPluginsResponse(plugins=plugins)


@router.put("/public-plugins", response_model=UpdatePluginsRequest)
async def update_public_plugins(req: UpdatePluginsRequest):
    """更新启用的公共插件列表（需管理员）"""
    valid_ids = {p["id"] for p in REGISTERED_PLUGINS}
    enabled = [pid for pid in req.enabled_ids if pid in valid_ids]
    settings.update({"enabled_public_plugins": enabled})
    logger.info("公共插件已更新: %s", enabled)
    return UpdatePluginsRequest(enabled_ids=enabled)


# ── LLM 配置 ──

class LLMConfigResponse(BaseModel):
    openai_api_key: str
    openai_base_url: str
    openai_model: str
    embedding_model: str
    embedding_provider: str


class LLMConfigRequest(BaseModel):
    openai_api_key: str = Field(description="OpenAI API Key")
    openai_base_url: str = Field(default="", description="API Base URL，留空使用默认")
    openai_model: str = Field(default="gpt-4o", description="模型名称")
    embedding_model: str = Field(default="text-embedding-3-small", description="Embedding 模型")
    embedding_provider: str = Field(default="openai", description="Embedding 提供商: openai 或 local")


# ── 通知设置 ──

class NotifySettingsResponse(BaseModel):
    notifyhub_key_set: bool  # 不暴露实际 key
    notifyhub_url: str


class NotifySettingsRequest(BaseModel):
    notifyhub_key: str | None = None
    notifyhub_url: str | None = None


@router.get("/notify", response_model=NotifySettingsResponse)
async def read_notify_settings():
    """获取通知配置"""
    return NotifySettingsResponse(
        notifyhub_key_set=bool(settings.notifyhub_key),
        notifyhub_url=settings.notifyhub_url,
    )


@router.put("/notify", response_model=NotifySettingsResponse)
async def update_notify_settings(req: NotifySettingsRequest):
    """更新通知配置"""
    patch: dict = {}
    if req.notifyhub_key is not None:
        patch["notifyhub_key"] = req.notifyhub_key
    if req.notifyhub_url is not None:
        patch["notifyhub_url"] = req.notifyhub_url
    if patch:
        settings.update(patch)
    return NotifySettingsResponse(
        notifyhub_key_set=bool(settings.notifyhub_key),
        notifyhub_url=settings.notifyhub_url,
    )


@router.get("/llm", response_model=LLMConfigResponse)
async def read_llm_config():
    """获取 LLM 配置（需管理员）"""
    api_key = settings.openai_api_key
    # 脱敏显示：只显示前4位和后4位
    if api_key and len(api_key) > 8:
        masked_key = api_key[:4] + "*" * (len(api_key) - 8) + api_key[-4:]
    else:
        masked_key = api_key
    return LLMConfigResponse(
        openai_api_key=masked_key,
        openai_base_url=settings.openai_base_url,
        openai_model=settings.openai_model,
        embedding_model=settings.embedding_model,
        embedding_provider=settings.embedding_provider,
    )


@router.put("/llm", response_model=LLMConfigResponse)
async def update_llm_config(req: LLMConfigRequest):
    """更新 LLM 配置（需管理员）"""
    from app.services.llm_client import reset_llm_client
    update_data = {
        "openai_api_key": req.openai_api_key,
        "openai_base_url": req.openai_base_url,
        "openai_model": req.openai_model,
        "embedding_model": req.embedding_model,
        "embedding_provider": req.embedding_provider,
    }
    settings.update(update_data)
    # 重置 LLM 客户端以使用新配置
    reset_llm_client()
    logger.info("LLM 配置已更新")
    # 返回脱敏后的配置
    api_key = req.openai_api_key
    if api_key and len(api_key) > 8:
        masked_key = api_key[:4] + "*" * (len(api_key) - 8) + api_key[-4:]
    else:
        masked_key = api_key
    return LLMConfigResponse(
        openai_api_key=masked_key,
        openai_base_url=req.openai_base_url,
        openai_model=req.openai_model,
        embedding_model=req.embedding_model,
        embedding_provider=req.embedding_provider,
    )
