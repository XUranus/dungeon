"""公共大屏 API - 无需登录，基于 visitor cookie 的会话管理"""

import logging
import secrets
from datetime import date, datetime, time as dtime

from fastapi import APIRouter, Depends, Request, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.database import get_db, async_session
from app.models import Topic, PublicVisitor, PublicMessage, RecommendedHolding
from app.config import settings
from app.schemas import ChatRequestBase
from app.services.rag import rag_query_stream
from app.utils.streaming import ui_stream_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

VISITOR_COOKIE = "pv_id"
VISITOR_COOKIE_MAX_AGE = 365 * 24 * 3600  # 1 年


# ── Pydantic 模型 ──────────────────────────────────────────────

class SummaryItem(BaseModel):
    id: int
    platform: str
    title: str | None
    content_preview: str
    content_type: str
    url: str | None
    like_count: int
    published_at: str | None
    model_config = {"from_attributes": True}


class DashboardChatRequest(ChatRequestBase):
    visitor_id: str | None = None


CONTENT_PREVIEW_LEN = 200


# ── Visitor 管理 ───────────────────────────────────────────────

async def _get_or_create_visitor(
    request: Request, response: Response, db: AsyncSession
) -> PublicVisitor:
    """从 cookie 读取 visitor_id，不存在则创建并 set-cookie"""
    vid = request.cookies.get(VISITOR_COOKIE)
    if vid:
        result = await db.execute(
            select(PublicVisitor).where(PublicVisitor.visitor_id == vid)
        )
        visitor = result.scalar_one_or_none()
        if visitor:
            return visitor

    # 创建新 visitor（处理并发竞态：ON CONFLICT DO NOTHING + 重试 SELECT）
    vid = secrets.token_hex(16)  # 32 字符 hex
    visitor = PublicVisitor(visitor_id=vid)
    db.add(visitor)
    try:
        await db.commit()
        await db.refresh(visitor)
    except IntegrityError:
        await db.rollback()
        # 并发请求已创建，重新查询
        result = await db.execute(
            select(PublicVisitor).where(PublicVisitor.visitor_id == vid)
        )
        visitor = result.scalar_one()
    logger.info("New public visitor created: %s", vid)

    response.set_cookie(
        VISITOR_COOKIE, vid,
        max_age=VISITOR_COOKIE_MAX_AGE,
        httponly=False,  # 前端需要读取
        samesite="lax",
        secure=True,
    )
    return visitor


# ── 端点 ───────────────────────────────────────────────────────

@router.get("/summary")
async def dashboard_summary(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """公共大屏：返回最新观点摘要"""
    query = (
        select(Topic)
        .order_by(Topic.published_at.desc())
        .limit(min(limit, 50))
    )
    result = await db.execute(query)
    topics = result.scalars().all()

    items = []
    for t in topics:
        content = t.content or ""
        preview = content[:CONTENT_PREVIEW_LEN]
        if len(content) > CONTENT_PREVIEW_LEN:
            preview += "..."
        items.append(
            SummaryItem(
                id=t.id,
                platform=t.platform,
                title=t.title,
                content_preview=preview,
                content_type=t.content_type,
                url=t.url,
                like_count=t.like_count,
                published_at=t.published_at.isoformat() if t.published_at else None,
            )
        )

    return {"items": items, "chat_remaining": settings.public_chat_daily_limit}


@router.get("/holdings")
async def dashboard_holdings(
    db: AsyncSession = Depends(get_db),
):
    """公共大屏：返回最新推荐持仓"""
    result = await db.execute(
        select(RecommendedHolding)
        .order_by(RecommendedHolding.generated_at.desc())
        .limit(10)
    )
    holdings = result.scalars().all()
    return [
        {
            "id": h.id,
            "stock_name": h.stock_name,
            "stock_code": h.stock_code,
            "sentiment": h.sentiment,
            "reason": h.reason,
            "source_kols": h.source_kols or [],
            "confidence": h.confidence,
            "generated_at": h.generated_at.isoformat() if h.generated_at else None,
        }
        for h in holdings
    ]


@router.post("/visitor")
async def get_or_create_visitor(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """获取或创建访客，返回 visitor_id（同时 set-cookie）"""
    visitor = await _get_or_create_visitor(request, response, db)
    return {"visitor_id": visitor.visitor_id}


@router.get("/messages")
async def get_messages(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """获取当前访客的所有聊天消息"""
    visitor = await _get_or_create_visitor(request, response, db)
    result = await db.execute(
        select(PublicMessage)
        .where(PublicMessage.visitor_id == visitor.visitor_id)
        .order_by(PublicMessage.id.asc())
    )
    messages = result.scalars().all()
    return {
        "visitor_id": visitor.visitor_id,
        "messages": [
            {"role": m.role, "content": m.content}
            for m in messages
        ],
    }


@router.post("/chat")
async def dashboard_chat(
    req: DashboardChatRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """公共大屏：RAG 问答 + 自动存储消息到服务端"""
    user_message = req.get_user_message()
    if not user_message.strip():
        raise HTTPException(status_code=422, detail="消息内容不能为空")

    visitor = await _get_or_create_visitor(request, response, db)
    vid = visitor.visitor_id

    # 检查每日限额：按 visitor_id 计数（从 DB 统计今日消息数）
    today_start = datetime.combine(date.today(), dtime.min)
    count_result = await db.execute(
        select(func.count()).select_from(PublicMessage).where(
            PublicMessage.visitor_id == vid,
            PublicMessage.role == "user",
            PublicMessage.created_at >= today_start,
        )
    )
    today_count = count_result.scalar() or 0
    if today_count >= settings.public_chat_daily_limit:
        raise HTTPException(
            status_code=429,
            detail=f"今日免费问答次数已用完（{settings.public_chat_daily_limit}次），请明天再试",
        )

    # 加载最近历史消息用于多轮对话（RAG引擎截取最后12条）
    MAX_HISTORY = 12
    history_result = await db.execute(
        select(PublicMessage)
        .where(PublicMessage.visitor_id == vid)
        .order_by(PublicMessage.id.desc())
        .limit(MAX_HISTORY)
    )
    history_messages = [
        {"role": m.role, "content": m.content}
        for m in reversed(history_result.scalars().all())
    ]

    # 保存用户消息
    db.add(PublicMessage(visitor_id=vid, role="user", content=user_message))
    await db.commit()

    # RAG 流式响应，完成后保存 assistant 消息
    return ui_stream_response(
        rag_query_stream(user_message, history=history_messages),
        on_complete=lambda text: _save_assistant_message(vid, text),
    )


async def _save_assistant_message(visitor_id: str, content: str):
    """保存 assistant 回复到数据库"""
    async with async_session() as db:
        db.add(PublicMessage(visitor_id=visitor_id, role="assistant", content=content))
        await db.commit()
        logger.debug("Saved assistant message for visitor %s", visitor_id)
