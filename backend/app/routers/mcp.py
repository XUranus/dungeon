"""MCP Server API — 供外部 Agent 调用的标准化接口

使用 MCP 专用 API Key 鉴权（非管理员 JWT）。
提供: 问答、知识库搜索、主题查询、教授指数等能力。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import verify_api_key
from app.database import async_session
from app.models import Topic
from app.services.rag import rag_query_stream
from app.services.tools import execute_tool
from app.services.professor_index import get_latest_snapshots
from app.utils.streaming import ui_stream_response
from sqlalchemy import select, func

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/mcp",
    tags=["mcp"],
    dependencies=[Depends(verify_api_key)],
)


# ── Schemas ──

class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None


class SearchRequest(BaseModel):
    query: str
    days: int | None = None
    content_type: str | None = None
    top_k: int = 5


# ── Endpoints ──

@router.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok", "service": "mcp"}


@router.post("/chat")
async def chat(req: ChatRequest):
    """流式问答 — 返回 SSE 流"""
    if not req.message.strip():
        raise HTTPException(status_code=422, detail="消息不能为空")

    history = req.history or []
    return ui_stream_response(rag_query_stream(req.message, history=history))


@router.post("/search")
async def search(req: SearchRequest):
    """知识库搜索 — 返回结构化 JSON"""
    result = await execute_tool("search_knowledge", {
        "query": req.query,
        "days": req.days,
        "content_type": req.content_type,
    })
    return {"query": req.query, "result": result}


@router.get("/topics")
async def list_topics(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    content_type: str | None = None,
    platform: str | None = None,
    search: str | None = None,
    is_digest: bool | None = None,
):
    """查询主题列表"""
    async with async_session() as db:
        q = select(Topic).order_by(Topic.published_at.desc())
        count_q = select(func.count(Topic.id))

        if content_type:
            q = q.where(Topic.content_type == content_type)
            count_q = count_q.where(Topic.content_type == content_type)
        if platform:
            q = q.where(Topic.platform == platform)
            count_q = count_q.where(Topic.platform == platform)
        if is_digest is not None:
            q = q.where(Topic.is_digest == is_digest)
            count_q = count_q.where(Topic.is_digest == is_digest)
        if search:
            q = q.where(Topic.title.contains(search) | Topic.content.contains(search))
            count_q = count_q.where(Topic.title.contains(search) | Topic.content.contains(search))

        total = (await db.execute(count_q)).scalar() or 0
        q = q.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(q)
        topics = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": t.id,
                "platform": t.platform,
                "title": t.title,
                "content_type": t.content_type,
                "url": t.url,
                "like_count": t.like_count,
                "comment_count": t.comment_count,
                "is_digest": t.is_digest,
                "published_at": t.published_at.isoformat() if t.published_at else None,
                "content_preview": t.content[:500] if t.content else "",
            }
            for t in topics
        ],
    }


@router.get("/topics/{topic_id}")
async def get_topic(topic_id: int):
    """查询单个主题详情"""
    async with async_session() as db:
        topic = await db.get(Topic, topic_id)
        if not topic:
            raise HTTPException(status_code=404, detail="主题不存在")

    return {
        "id": topic.id,
        "platform": topic.platform,
        "platform_topic_id": topic.platform_topic_id,
        "title": topic.title,
        "content": topic.content,
        "content_type": topic.content_type,
        "url": topic.url,
        "like_count": topic.like_count,
        "comment_count": topic.comment_count,
        "is_digest": topic.is_digest,
        "published_at": topic.published_at.isoformat() if topic.published_at else None,
        "images": topic.images,
    }


@router.get("/professor-index")
async def professor_index():
    """获取教授指数"""
    return await get_latest_snapshots()
