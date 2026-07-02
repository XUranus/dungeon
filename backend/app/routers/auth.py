"""API Key 管理"""

import hmac
import time
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.auth import verify_api_key, generate_api_key, Depends

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── 简易速率限制 ──
_VERIFY_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_MAX_ATTEMPTS = 10
_WINDOW_SECONDS = 300


def _check_rate_limit(ip: str):
    now = time.monotonic()
    _VERIFY_ATTEMPTS[ip] = [t for t in _VERIFY_ATTEMPTS[ip] if now - t < _WINDOW_SECONDS]
    if len(_VERIFY_ATTEMPTS[ip]) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"尝试过于频繁，请 {_WINDOW_SECONDS // 60} 分钟后再试",
        )
    _VERIFY_ATTEMPTS[ip].append(now)


# ── Schemas ──

class VerifyRequest(BaseModel):
    api_key: str


class VerifyResponse(BaseModel):
    ok: bool


class KeyInfoResponse(BaseModel):
    api_key_set: bool
    api_key_preview: str


class KeyRefreshResponse(BaseModel):
    api_key: str
    api_key_preview: str


# ── Endpoints ──

@router.post("/verify", response_model=VerifyResponse)
async def verify(req: VerifyRequest, request: Request):
    """验证 API Key 是否正确（用于前端登录）"""
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    expected = settings.api_key
    if not expected:
        raise HTTPException(status_code=500, detail="API Key 未配置")
    if not hmac.compare_digest(req.api_key, expected):
        raise HTTPException(status_code=401, detail="API Key 错误")
    return VerifyResponse(ok=True)


@router.get("/key", response_model=KeyInfoResponse)
async def read_key(admin: str = Depends(verify_api_key)):
    """获取当前 API Key（脱敏显示）"""
    key = settings.api_key or ""
    if key and len(key) > 16:
        preview = key[:8] + "..." + key[-8:]
    else:
        preview = "(未设置)" if not key else key
    return KeyInfoResponse(api_key_set=bool(key), api_key_preview=preview)


@router.put("/key/refresh", response_model=KeyRefreshResponse)
async def refresh_key(admin: str = Depends(verify_api_key)):
    """刷新 API Key（生成新 key，旧 key 立即失效）"""
    new_key = generate_api_key()
    settings.update({"api_key": new_key})
    preview = new_key[:8] + "..." + new_key[-8:]
    return KeyRefreshResponse(api_key=new_key, api_key_preview=preview)
