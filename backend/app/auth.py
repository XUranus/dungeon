"""统一 API Key 鉴权

使用单一 api_key 同时保护管理后台和 MCP 外部接口。
类似 OpenAI/Anthropic 的 API Key 模式。
"""

import hmac
import logging
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


async def verify_api_key(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """FastAPI dependency: 验证 API Key，通过返回 'admin'"""
    if cred is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少 Authorization header")
    api_key = settings.api_key
    if not api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="API Key 未配置")
    if not hmac.compare_digest(cred.credentials, api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API Key 无效")
    return "admin"


async def optional_api_key(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str | None:
    """FastAPI dependency: 有 key 返回 'admin'，无 key 返回 None"""
    if cred is None:
        return None
    api_key = settings.api_key
    if not api_key:
        return None
    if hmac.compare_digest(cred.credentials, api_key):
        return "admin"
    return None


def generate_api_key() -> str:
    """生成一个新的 API Key"""
    return secrets.token_urlsafe(32)
