"""数据源管理API - 触发爬虫任务（仅管理员）"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session as async_session_factory
from app.models import CrawlTask
from app.services.ingestion import ingest_platform, ingest_all, get_enabled_platforms
from app.services import task_manager
from app.auth import verify_api_key

router = APIRouter(
    prefix="/api/sources",
    tags=["sources"],
    dependencies=[Depends(verify_api_key)],
)


class CrawlTaskResponse(BaseModel):
    id: int
    platform: str
    status: str
    topics_count: int
    comments_count: int
    error_message: str | None
    started_at: datetime | None = None
    finished_at: datetime | None = None

    model_config = {"from_attributes": True}


@router.get("/platforms")
async def list_platforms():
    """返回已配置的平台列表"""
    return {"platforms": get_enabled_platforms()}


@router.post("/crawl")
async def crawl_all(db: AsyncSession = Depends(get_db)):
    """爬取所有已配置平台"""
    platforms = get_enabled_platforms()
    if not platforms:
        raise HTTPException(status_code=400, detail="未配置任何平台的Cookie或ID")
    try:
        tasks = await ingest_all(db)
        return [
            {
                "platform": t.platform,
                "status": t.status,
                "topics_count": t.topics_count,
                "comments_count": t.comments_count,
            }
            for t in tasks
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 固定路径必须在 {platform} 参数路由之前，否则 "async"/"status" 会被当作 platform
@router.post("/crawl/async")
async def crawl_async(platform: str = "zsxq"):
    """启动异步爬取任务（不阻塞请求）"""
    if platform not in get_enabled_platforms():
        raise HTTPException(status_code=400, detail=f"平台 {platform} 未配置")

    result = task_manager.start_crawl(
        platform=platform,
        crawl_func=ingest_platform,
        db_factory=async_session_factory,
        full_crawl=True,
    )
    if result is None:
        raise HTTPException(status_code=409, detail="已有爬取任务在运行，请等待完成")
    return result


@router.get("/crawl/status")
async def crawl_status():
    """查询当前爬取任务状态"""
    return task_manager.get_status()


@router.post("/crawl/{platform}")
async def crawl_platform(platform: str, db: AsyncSession = Depends(get_db)):
    """爬取指定平台"""
    if platform not in get_enabled_platforms():
        raise HTTPException(status_code=400, detail=f"平台 {platform} 未配置")
    try:
        task = await ingest_platform(db, platform)
        return {
            "platform": task.platform,
            "status": task.status,
            "topics_count": task.topics_count,
            "comments_count": task.comments_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks", response_model=list[CrawlTaskResponse])
async def list_tasks(db: AsyncSession = Depends(get_db)):
    """查看爬取任务历史"""
    result = await db.execute(
        select(CrawlTask).order_by(CrawlTask.id.desc()).limit(50)
    )
    return result.scalars().all()
