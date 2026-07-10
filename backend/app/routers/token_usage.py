"""Token 用量统计 API"""

import logging

from fastapi import APIRouter, Depends

from app.auth import verify_api_key
from app.services.token_usage import get_monthly_stats

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/token-usage",
    tags=["token-usage"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("")
async def get_usage(year: int | None = None, month: int | None = None):
    """获取指定月份的 token 用量统计（默认当月）"""
    return await get_monthly_stats(year, month)
