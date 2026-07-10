"""FastAPI 主入口"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import init_db, async_session, engine
from app.config import settings
from app.routers import chat, topics, sources, proxy, auth, dashboard, holdings, professor_index, mcp, plugins, insight_report, token_usage
from app.routers import settings as settings_router
from app.utils.scheduler import setup_scheduler, shutdown_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _migrate_config():
    """迁移旧配置字段到新的统一 api_key"""
    data = settings.to_dict()
    changed = False

    # 旧字段 → 新 api_key
    if "mcp_api_key" in data:
        if data["mcp_api_key"] and not data.get("api_key"):
            data["api_key"] = data["mcp_api_key"]
            logger.info("配置迁移: mcp_api_key → api_key")
        data.pop("mcp_api_key")
        changed = True

    for old_key in ("admin_password", "jwt_secret", "jwt_expire_hours"):
        if old_key in data:
            data.pop(old_key)
            changed = True

    if changed:
        # 直接替换整个 _data，确保旧字段被删除
        settings._data = data
        settings.save()
        logger.info("配置迁移完成")


@asynccontextmanager
async def lifespan(app: FastAPI):

    # 配置迁移：旧字段 → 新 api_key
    _migrate_config()

    if not settings.api_key:
        logger.warning("⚠️  api_key 未配置，请在 config.json 中设置或通过设置页面生成")

    await init_db()

    # 启动时自动迁移：检查并添加缺失的列
    from sqlalchemy import text
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE topics ADD COLUMN is_digest BOOLEAN DEFAULT 0"))
            logger.info("自动迁移: topics 表添加 is_digest 列")
    except Exception:
        pass  # 列已存在，忽略

    # 启动时清理残留的 running/pending 任务（进程重启后这些任务已丢失）
    from datetime import datetime
    from app.models import ProfessorIndexParseTask, CrawlTask
    from sqlalchemy import update
    async with async_session() as db:
        now = datetime.now()
        for model, label in [
            (ProfessorIndexParseTask, "教授指数解析"),
            (CrawlTask, "爬取"),
        ]:
            result = await db.execute(
                update(model)
                .where(model.status.in_(["running", "pending"]))
                .values(status="error", error_message="进程重启，任务中断", finished_at=now)
            )
            if result.rowcount > 0:
                logger.info("启动清理: %d 条 %s 任务标记为 error", result.rowcount, label)
        await db.commit()

    # 如果使用本地embedding，启动时检测并下载模型
    if settings.embedding_provider == "local":
        from app.services.embedding import ensure_local_model
        if not ensure_local_model():
            logger.warning("本地embedding模型不可用，embedding功能将降级")
    setup_scheduler()
    # 构建 BM25 索引（用于混合检索）
    if settings.enable_bm25:
        from app.services.hybrid_retriever import build_bm25_index
        build_bm25_index()
    # 初始化插件运行时
    from app.plugins.runtime import runtime as plugin_runtime
    plugin_runtime.init()
    yield
    shutdown_scheduler()


app = FastAPI(
    title="财经大V观点分析系统",
    description="爬取星主在知乎/知识星球的发言，提供RAG问答",
    version="0.1.0",
    lifespan=lifespan,
)

_cors_origins = settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
app.include_router(topics.router)
app.include_router(sources.router)
app.include_router(settings_router.router)
app.include_router(settings_router.public_router)
app.include_router(holdings.router)
app.include_router(professor_index.router)
app.include_router(professor_index.public_router)
app.include_router(insight_report.router)
app.include_router(insight_report.public_router)
app.include_router(token_usage.router)
app.include_router(proxy.router)
app.include_router(mcp.router)
app.include_router(plugins.router)
app.include_router(plugins.public_router)

# 静态文件服务：上传的文件
import os
from app.config import PROJECT_ROOT
_uploads_dir = PROJECT_ROOT / "data" / "uploads"
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
