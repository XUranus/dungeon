"""数据浏览API（仅管理员）"""

from datetime import datetime
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Topic, Comment
from app.auth import verify_api_key

router = APIRouter(
    prefix="/api/topics",
    tags=["topics"],
    dependencies=[Depends(verify_api_key)],
)


class TopicResponse(BaseModel):
    id: int
    platform: str
    title: str | None
    content: str
    content_type: str
    url: str | None
    like_count: int
    comment_count: int
    images: list[dict] | None = None
    published_at: datetime | None = None

    model_config = {"from_attributes": True}


class CommentResponse(BaseModel):
    id: int
    author_name: str | None
    content: str
    like_count: int
    images: list[dict] | None = None
    published_at: datetime | None = None

    model_config = {"from_attributes": True}


@router.get("")
async def list_topics(
    platform: str | None = None,
    content_type: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """浏览主题列表 (带分页和筛选)"""
    query = select(Topic)
    count_query = select(func.count(Topic.id))

    if platform:
        query = query.where(Topic.platform == platform)
        count_query = count_query.where(Topic.platform == platform)
    if content_type:
        query = query.where(Topic.content_type == content_type)
        count_query = count_query.where(Topic.content_type == content_type)
    if search:
        query = query.where(Topic.content.contains(search))
        count_query = count_query.where(Topic.content.contains(search))

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Topic.published_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    topics = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [TopicResponse.model_validate(t) for t in topics],
    }


@router.get("/{topic_id}/comments", response_model=list[CommentResponse])
async def list_comments(topic_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Comment)
        .where(Comment.topic_id == topic_id)
        .order_by(Comment.published_at.desc())
    )
    return result.scalars().all()
