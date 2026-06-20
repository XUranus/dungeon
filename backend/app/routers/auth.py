"""管理员登录 API"""

import hmac
import time
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.auth import create_token, get_current_admin, Depends

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


# ── 简易速率限制 ──
_LOGIN_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_MAX_ATTEMPTS = 5       # 窗口内最大尝试次数
_WINDOW_SECONDS = 300   # 5 分钟窗口


def _check_rate_limit(ip: str):
    """检查 IP 是否超过登录速率限制"""
    now = time.monotonic()
    attempts = _LOGIN_ATTEMPTS[ip]
    # 清除窗口外的记录
    _LOGIN_ATTEMPTS[ip] = [t for t in attempts if now - t < _WINDOW_SECONDS]
    if len(_LOGIN_ATTEMPTS[ip]) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"登录尝试过于频繁，请 {_WINDOW_SECONDS // 60} 分钟后再试",
        )
    _LOGIN_ATTEMPTS[ip].append(now)


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request):
    """管理员登录"""
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    if not settings.admin_password:
        raise HTTPException(status_code=500, detail="管理员密码未配置")
    # 使用常量时间比较防止时序攻击
    if not hmac.compare_digest(req.password, settings.admin_password):
        raise HTTPException(status_code=401, detail="密码错误")
    return LoginResponse(token=create_token())


@router.get("/check")
async def check(admin: str = Depends(get_current_admin)):
    """验证 token 是否有效"""
    return {"ok": True}
