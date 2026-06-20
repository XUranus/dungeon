"""推荐持仓管理 API（仅管理员）"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_admin
from app.database import get_db
from app.models import RecommendedHolding
from app.services.holdings_generator import generate_holdings

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/holdings",
    tags=["holdings"],
    dependencies=[Depends(get_current_admin)],
)


class HoldingResponse(BaseModel):
    id: int
    stock_name: str
    stock_code: str | None
    sentiment: str
    reason: str
    source_kols: list[str] | None
    confidence: float
    generated_at: str | None
    model_config = {"from_attributes": True}


@router.get("")
async def list_holdings(db: AsyncSession = Depends(get_db)):
    """获取所有推荐持仓"""
    result = await db.execute(
        select(RecommendedHolding).order_by(RecommendedHolding.generated_at.desc())
    )
    holdings = result.scalars().all()
    return [
        {
            "id": h.id,
            "stock_name": h.stock_name,
            "stock_code": h.stock_code,
            "sentiment": h.sentiment,
            "reason": h.reason,
            "source_kols": h.source_kols or [],
            "confidence": h.confidence,
            "generated_at": h.generated_at.isoformat() if h.generated_at else None,
        }
        for h in holdings
    ]


@router.post("/generate")
async def trigger_generate():
    """触发 AI 生成推荐持仓（覆盖旧数据）"""
    try:
        holdings = await generate_holdings()
        return {"message": f"已生成 {len(holdings)} 条推荐持仓", "count": len(holdings)}
    except Exception as e:
        logger.exception("持仓生成失败")
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")


@router.delete("/{holding_id}")
async def delete_holding(
    holding_id: int,
    db: AsyncSession = Depends(get_db),
):
    """删除单条推荐持仓"""
    result = await db.execute(
        select(RecommendedHolding).where(RecommendedHolding.id == holding_id)
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail="持仓不存在")
    await db.delete(holding)
    await db.commit()
    return {"message": "已删除"}
