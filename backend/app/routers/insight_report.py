"""近期观点总结 API — 定时报告查询与配置"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc

from app.auth import verify_api_key
from app.config import settings
from app.database import async_session
from app.models import InsightReport
from app.services.insight_report import generate_insight_report

logger = logging.getLogger(__name__)

# 管理端点（需认证）
router = APIRouter(
    prefix="/api/insight-report",
    tags=["insight-report"],
    dependencies=[Depends(verify_api_key)],
)

# 公开端点（无需认证）
public_router = APIRouter(prefix="/api/insight-report", tags=["insight-report"])

# 全局锁：同一时间只允许一个生成任务
_gen_lock = asyncio.Lock()


# ── 公开端点 ──

@public_router.get("")
async def get_latest_reports(limit: int = 10):
    """获取最新的观点总结报告列表（公开）"""
    async with async_session() as db:
        result = await db.execute(
            select(InsightReport)
            .order_by(desc(InsightReport.id))
            .limit(min(limit, 50))
        )
        reports = result.scalars().all()
        return [
            {
                "id": r.id,
                "generated_at": r.generated_at.isoformat() if r.generated_at else None,
                "time_range_start": r.time_range_start.isoformat() if r.time_range_start else None,
                "time_range_end": r.time_range_end.isoformat() if r.time_range_end else None,
                "topic_count": r.topic_count,
                "content": r.content,
                "sources_json": r.sources_json or [],
            }
            for r in reports
        ]


@public_router.get("/{report_id}")
async def get_report(report_id: int):
    """获取单篇报告详情（公开）"""
    async with async_session() as db:
        report = await db.get(InsightReport, report_id)
        if not report:
            raise HTTPException(status_code=404, detail="报告不存在")
        return {
            "id": report.id,
            "generated_at": report.generated_at.isoformat() if report.generated_at else None,
            "time_range_start": report.time_range_start.isoformat() if report.time_range_start else None,
            "time_range_end": report.time_range_end.isoformat() if report.time_range_end else None,
            "topic_count": report.topic_count,
            "content": report.content,
            "sources_json": report.sources_json or [],
        }


# ── 管理端点 ──

@router.post("/generate")
async def trigger_generate():
    """手动触发观点总结生成"""
    if _gen_lock.locked():
        raise HTTPException(status_code=409, detail="已有生成任务在运行，请等待完成")

    async with _gen_lock:
        result = await generate_insight_report()
    return result


@router.get("/config")
async def get_config():
    """获取观点总结配置"""
    return {
        "interval_minutes": settings.insight_report_interval_minutes,
        "ndays": settings.insight_report_ndays,
    }


class InsightReportConfig(BaseModel):
    interval_minutes: int | None = None
    ndays: int | None = None


@router.put("/config")
async def update_config(config: InsightReportConfig):
    """更新观点总结配置"""
    patch = {}
    if config.interval_minutes is not None:
        if config.interval_minutes < 0:
            raise HTTPException(status_code=400, detail="间隔不能为负数")
        patch["insight_report_interval_minutes"] = config.interval_minutes
    if config.ndays is not None:
        if config.ndays < 1 or config.ndays > 90:
            raise HTTPException(status_code=400, detail="天数范围: 1-90")
        patch["insight_report_ndays"] = config.ndays

    if patch:
        settings.update(patch)
        # 热更新调度器
        from app.utils.scheduler import apply_insight_report_interval
        if config.interval_minutes is not None:
            apply_insight_report_interval(config.interval_minutes)

    return {
        "interval_minutes": settings.insight_report_interval_minutes,
        "ndays": settings.insight_report_ndays,
    }
