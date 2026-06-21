"""FastAPI 主入口"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.config import settings
from app.routers import chat, topics, sources, proxy, auth, dashboard, holdings, professor_index
from app.routers import settings as settings_router
from app.utils.scheduler import setup_scheduler, shutdown_scheduler

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = logging.getLogger(__name__)

    # 安全检查
    if settings.jwt_secret == "change-me-to-a-random-string":
        logger.warning("⚠️  jwt_secret 使用默认值，请在 config.json 中设置随机密钥！")
    if not settings.admin_password:
        logger.warning("⚠️  admin_password 未配置，管理员登录将不可用")

    await init_db()
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
app.include_router(proxy.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
