"""聊天/问答API（仅管理员 - 无限次数）"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.services.rag import rag_query_stream
from app.auth import verify_api_key
from app.schemas import ChatRequestBase, UIMessage
from app.utils.streaming import ui_stream_response

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/chat",
    tags=["chat"],
    dependencies=[Depends(verify_api_key)],
)


class ChatRequest(ChatRequestBase):
    history: list[UIMessage] | None = None
    kol_id: int | None = None
    platform: str | None = None


@router.post("")
async def chat(req: ChatRequest):
    """RAG问答 - UI Message Stream 格式，支持多轮对话和工具调用"""
    user_message = req.get_user_message()
    if not user_message.strip():
        raise HTTPException(status_code=422, detail="消息内容不能为空")

    filters: dict | None = None
    if req.kol_id:
        filters = {"kol_id": req.kol_id}
    elif req.platform:
        filters = {"platform": req.platform}

    history = [{"role": m.role, "content": m.content} for m in (req.history or []) if m.content]

    return ui_stream_response(rag_query_stream(user_message, filters=filters, history=history))
