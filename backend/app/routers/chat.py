"""聊天/问答API（仅管理员 - 无限次数）"""

import logging

from fastapi import APIRouter, Depends

from app.services.rag import rag_query_stream
from app.auth import get_current_admin
from app.utils.streaming import ui_stream_response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/chat",
    tags=["chat"],
    dependencies=[Depends(get_current_admin)],
)


class UIMessage(BaseModel):
    role: str
    content: str | None = None
    parts: list[dict] | None = None


class ChatRequest(BaseModel):
    message: str | None = None  # 旧格式
    messages: list[UIMessage] | None = None  # AI SDK v6 格式
    history: list[UIMessage] | None = None
    kol_id: int | None = None
    platform: str | None = None

    def get_user_message(self) -> str:
        """提取用户最新消息（兼容新旧两种格式）"""
        if self.message:
            return self.message
        if self.messages:
            for m in reversed(self.messages):
                if m.role == "user":
                    if m.content:
                        return m.content
                    if m.parts:
                        for p in m.parts:
                            if p.get("type") == "text" and p.get("text"):
                                return p["text"]
        return ""


@router.post("")
async def chat(req: ChatRequest):
    """RAG问答 - UI Message Stream 格式，支持多轮对话和工具调用"""
    user_message = req.get_user_message()
    if not user_message.strip():
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="消息内容不能为空")

    filters: dict | None = None
    if req.kol_id:
        filters = {"kol_id": req.kol_id}
    elif req.platform:
        filters = {"platform": req.platform}

    history = [{"role": m.role, "content": m.content} for m in (req.history or []) if m.content]

    return ui_stream_response(rag_query_stream(user_message, filters=filters, history=history))
