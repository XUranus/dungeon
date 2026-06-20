"""管理员 JWT 认证"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from app.config import settings

_bearer = HTTPBearer(auto_error=False)

# JWT payload 结构
ALGORITHM = "HS256"


def create_token() -> str:
    """签发管理员 JWT token"""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    payload = {"sub": "admin", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def verify_token(token: str) -> bool:
    """验证 token 是否有效"""
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return True
    except JWTError:
        return False


async def get_current_admin(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """FastAPI dependency: 要求有效 JWT，否则 401"""
    if cred is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    if not verify_token(cred.credentials):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token 无效或已过期")
    return "admin"


async def optional_admin(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str | None:
    """FastAPI dependency: 有 token 返回 admin，无 token 返回 None"""
    if cred is None:
        return None
    if verify_token(cred.credentials):
        return "admin"
    return None
