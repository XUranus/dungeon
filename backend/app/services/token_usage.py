"""Token 用量统计服务 — 记录每次 LLM 调用的 token 消耗，按月汇总"""

import logging
from datetime import datetime

from sqlalchemy import select, func, extract

from app.database import async_session
from app.models import TokenUsage

logger = logging.getLogger(__name__)


async def record_usage(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    caller: str,
):
    """记录一次 LLM 调用的 token 用量"""
    try:
        async with async_session() as db:
            db.add(TokenUsage(
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                caller=caller,
            ))
            await db.commit()
    except Exception as e:
        logger.warning("Token 用量记录失败: %s", e)


def record_usage_from_response(response, caller: str):
    """从 OpenAI ChatCompletion response 对象中提取 usage 并记录（同步，fire-and-forget）"""
    try:
        usage = getattr(response, "usage", None)
        if usage is None:
            return
        import asyncio
        loop = asyncio.get_running_loop()
        loop.create_task(record_usage(
            model=getattr(response, "model", "unknown"),
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            total_tokens=getattr(usage, "total_tokens", 0) or 0,
            caller=caller,
        ))
    except Exception as e:
        logger.debug("Token usage record skipped: %s", e)


async def get_monthly_stats(year: int | None = None, month: int | None = None) -> dict:
    """获取指定月份的 token 用量统计。默认当前月。"""
    now = datetime.now()
    year = year or now.year
    month = month or now.month

    async with async_session() as db:
        # 当月总量
        result = await db.execute(
            select(
                func.coalesce(func.sum(TokenUsage.prompt_tokens), 0).label("prompt"),
                func.coalesce(func.sum(TokenUsage.completion_tokens), 0).label("completion"),
                func.coalesce(func.sum(TokenUsage.total_tokens), 0).label("total"),
                func.count(TokenUsage.id).label("calls"),
            ).where(
                extract("year", TokenUsage.created_at) == year,
                extract("month", TokenUsage.created_at) == month,
            )
        )
        row = result.one()

        # 按 caller 分组
        result_by_caller = await db.execute(
            select(
                TokenUsage.caller,
                func.coalesce(func.sum(TokenUsage.total_tokens), 0).label("total"),
                func.count(TokenUsage.id).label("calls"),
            ).where(
                extract("year", TokenUsage.created_at) == year,
                extract("month", TokenUsage.created_at) == month,
            ).group_by(TokenUsage.caller)
        )
        by_caller = [
            {"caller": r.caller, "total_tokens": r.total, "calls": r.calls}
            for r in result_by_caller.all()
        ]

        # 按 model 分组
        result_by_model = await db.execute(
            select(
                TokenUsage.model,
                func.coalesce(func.sum(TokenUsage.total_tokens), 0).label("total"),
                func.count(TokenUsage.id).label("calls"),
            ).where(
                extract("year", TokenUsage.created_at) == year,
                extract("month", TokenUsage.created_at) == month,
            ).group_by(TokenUsage.model)
        )
        by_model = [
            {"model": r.model, "total_tokens": r.total, "calls": r.calls}
            for r in result_by_model.all()
        ]

        # 按日趋势
        result_by_day = await db.execute(
            select(
                func.date(TokenUsage.created_at).label("day"),
                func.coalesce(func.sum(TokenUsage.total_tokens), 0).label("total"),
                func.count(TokenUsage.id).label("calls"),
            ).where(
                extract("year", TokenUsage.created_at) == year,
                extract("month", TokenUsage.created_at) == month,
            ).group_by(func.date(TokenUsage.created_at))
            .order_by(func.date(TokenUsage.created_at))
        )
        by_day = [
            {"date": str(r.day), "total_tokens": r.total, "calls": r.calls}
            for r in result_by_day.all()
        ]

    return {
        "year": year,
        "month": month,
        "prompt_tokens": row.prompt,
        "completion_tokens": row.completion,
        "total_tokens": row.total,
        "total_calls": row.calls,
        "by_caller": by_caller,
        "by_model": by_model,
        "by_day": by_day,
    }
