"""共享 LLM 客户端单例 — 避免每次请求重建连接池"""

from openai import AsyncOpenAI
from app.config import settings

_client: AsyncOpenAI | None = None
_current_key: str | None = None
_current_base_url: str | None = None


def get_llm_client() -> AsyncOpenAI:
    """获取或创建 AsyncOpenAI 单例客户端（配置变更时自动重建）"""
    global _client, _current_key, _current_base_url
    key = settings.openai_api_key
    base_url = settings.openai_base_url or None
    if _client is not None and _current_key == key and _current_base_url == base_url:
        return _client
    # 配置变更或首次创建
    kwargs: dict = {"api_key": key, "timeout": 120.0}
    if base_url:
        kwargs["base_url"] = base_url
    _client = AsyncOpenAI(**kwargs)
    _current_key = key
    _current_base_url = base_url
    return _client


def reset_llm_client():
    """重置客户端（配置变更后调用）"""
    global _client, _current_key, _current_base_url
    _client = None
    _current_key = None
    _current_base_url = None
