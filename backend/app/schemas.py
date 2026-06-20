"""共享 Pydantic 模型 — 避免跨路由重复定义"""

from pydantic import BaseModel


class UIMessage(BaseModel):
    """AI SDK v6 消息格式"""
    role: str
    content: str | None = None
    parts: list[dict] | None = None


class ChatRequestBase(BaseModel):
    """聊天请求基类，兼容新旧两种消息格式"""
    message: str | None = None  # 旧格式
    messages: list[UIMessage] | None = None  # AI SDK v6 格式

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
