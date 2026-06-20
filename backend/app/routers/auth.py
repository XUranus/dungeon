"""管理员登录 API"""

import hmac

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.auth import create_token, get_current_admin, Depends

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """管理员登录"""
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
