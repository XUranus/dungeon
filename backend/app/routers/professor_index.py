"""教授指数 API — 异步解析 + 间隔配置 + 历史记录"""

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc

from app.auth import verify_api_key
from app.config import settings
from app.database import async_session
from app.models import ProfessorIndexParseTask
from app.services.professor_index import update_professor_index, get_latest_snapshots

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/professor-index",
    tags=["professor-index"],
    dependencies=[Depends(verify_api_key)],
)

public_router = APIRouter(prefix="/api/dashboard/professor-index", tags=["professor-index"])

# ── 全局锁：同一时间只允许一个解析任务 ──
_parse_lock = asyncio.Lock()


# ── 后台任务 ──

async def _run_parse(task_id: int, triggered_by: str):
    """后台执行教授指数解析"""
    async with async_session() as db:
        task = await db.get(ProfessorIndexParseTask, task_id)
        if not task:
            return
        task.status = "running"
        task.started_at = datetime.now()
        await db.commit()

    articles_fetched = 0
    try:
        # Step 1: 抓取专栏文章
        try:
            from app.services.ingestion import _ingest_column_articles
            from app.crawlers.zsxq import ZsxqCrawler

            if settings.zsxq_cookie and settings.zsxq_group_id:
                async with async_session() as db:
                    crawler = ZsxqCrawler()
                    try:
                        articles_fetched = await _ingest_column_articles(
                            db, crawler, settings.zsxq_group_id, "zsxq"
                        )
                    finally:
                        await crawler.close()
                logger.info("教授指数: 专栏文章抓取 %d 篇", articles_fetched)
        except Exception as e:
            logger.warning("教授指数: 专栏文章抓取失败(不影响解析): %s", e)

        # Step 2: LLM 解析
        result = await update_professor_index()

        china_count = len(result.get("china", []))
        global_count = len(result.get("global", []))
        message = result.get("message", "")

        # 更新任务状态
        async with async_session() as db:
            task = await db.get(ProfessorIndexParseTask, task_id)
            if task:
                task.status = "done"
                task.articles_fetched = articles_fetched
                task.china_count = china_count
                task.global_count = global_count
                task.message = message
                task.finished_at = datetime.now()
                await db.commit()

        logger.info("教授指数解析完成: %s", message)

    except Exception as e:
        logger.error("教授指数解析失败: %s", e, exc_info=True)
        async with async_session() as db:
            task = await db.get(ProfessorIndexParseTask, task_id)
            if task:
                task.status = "error"
                task.error_message = str(e)[:1000]
                task.finished_at = datetime.now()
                await db.commit()


# ── 解析端点 ──

@router.post("/parse")
async def parse_professor_index():
    """触发教授指数解析（异步后台任务）"""
    if _parse_lock.locked():
        raise HTTPException(status_code=409, detail="已有解析任务在运行，请等待完成")

    async with _parse_lock:
        # 创建任务记录
        async with async_session() as db:
            task = ProfessorIndexParseTask(
                status="pending",
                triggered_by="manual",
            )
            db.add(task)
            await db.commit()
            await db.refresh(task)
            task_id = task.id

        # 启动后台任务
        asyncio.create_task(_run_parse(task_id, "manual"))

    return {"task_id": task_id, "status": "running"}


@router.get("/parse/status")
async def get_parse_status():
    """获取最新解析任务状态"""
    async with async_session() as db:
        result = await db.execute(
            select(ProfessorIndexParseTask)
            .order_by(desc(ProfessorIndexParseTask.id))
            .limit(1)
        )
        task = result.scalar_one_or_none()
        if not task:
            return {"status": "idle"}
        return {
            "task_id": task.id,
            "status": task.status,
            "triggered_by": task.triggered_by,
            "articles_fetched": task.articles_fetched,
            "china_count": task.china_count,
            "global_count": task.global_count,
            "message": task.message,
            "error_message": task.error_message,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "finished_at": task.finished_at.isoformat() if task.finished_at else None,
        }


@router.get("/parse/history")
async def get_parse_history():
    """获取解析历史记录"""
    async with async_session() as db:
        result = await db.execute(
            select(ProfessorIndexParseTask)
            .order_by(desc(ProfessorIndexParseTask.id))
            .limit(50)
        )
        tasks = result.scalars().all()
        return [
            {
                "id": t.id,
                "status": t.status,
                "triggered_by": t.triggered_by,
                "articles_fetched": t.articles_fetched,
                "china_count": t.china_count,
                "global_count": t.global_count,
                "message": t.message,
                "error_message": t.error_message,
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "finished_at": t.finished_at.isoformat() if t.finished_at else None,
            }
            for t in tasks
        ]


# ── 间隔配置 ──

class IntervalConfig(BaseModel):
    interval_days: int


@router.get("/interval")
async def get_interval():
    """获取教授指数解析间隔（天）"""
    return {"interval_days": settings.professor_index_interval_days}


@router.put("/interval")
async def update_interval(config: IntervalConfig):
    """更新教授指数解析间隔"""
    if config.interval_days not in (1, 7, 15, 30):
        raise HTTPException(status_code=400, detail="间隔只能是 1, 7, 15, 30 天")
    settings.update({"professor_index_interval_days": config.interval_days})
    return {"interval_days": config.interval_days}


# ── 公共端点 ──

@public_router.get("")
async def get_professor_index_public():
    """获取最新教授指数快照（公开）"""
    return await get_latest_snapshots()
