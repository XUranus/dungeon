"""共享 LLM 客户端单例 — 避免每次请求重建连接池"""

from openai import AsyncOpenAI
from app.config import settings

_client: AsyncOpenAI | None = None


def get_llm_client() -> AsyncOpenAI:
    """获取或创建 AsyncOpenAI 单例客户端"""
    global _client
    if _client is None:
        kwargs: dict = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _client = AsyncOpenAI(**kwargs)
    return _client


def reset_llm_client():
    """重置客户端（配置变更后调用）"""
    global _client
    _client = None
