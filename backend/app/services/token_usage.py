"""Token 用量统计服务 — 记录每次 LLM 调用的 token 消耗，按月汇总"""

import asyncio
import logging
import threading
import time
from datetime import datetime
from typing import Any

from sqlalchemy import select, func, extract

from app.database import async_session
from app.models import TokenUsage

logger = logging.getLogger(__name__)

# ── 批量写入缓冲 ──
_USAGE_BUFFER: list[dict[str, Any]] = []
_USAGE_BUFFER_LOCK = threading.Lock()
_USAGE_BUFFER_SIZE = 50
_USAGE_FLUSH_INTERVAL = 10  # 秒
_last_flush_time: float = time.monotonic()


def _buffer_usage(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    caller: str,
) -> None:
    """将一条用量记录追加到内存缓冲，达到阈值时触发异步刷写"""
    global _last_flush_time
    record = {
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "caller": caller,
    }
    should_flush = False
    with _USAGE_BUFFER_LOCK:
        _USAGE_BUFFER.append(record)
        if len(_USAGE_BUFFER) >= _USAGE_BUFFER_SIZE:
            should_flush = True
            _last_flush_time = time.monotonic()
    if should_flush:
        _schedule_flush()


def _schedule_flush() -> None:
    """尝试获取事件循环并调度一次 flush"""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(flush_usage_buffer())
    except RuntimeError:
        # 不在异步上下文中，直接同步刷写
        try:
            asyncio.run(flush_usage_buffer())
        except Exception:
            pass


def _check_periodic_flush() -> None:
    """检查是否到了定时刷写的时间"""
    global _last_flush_time
    with _USAGE_BUFFER_LOCK:
        if not _USAGE_BUFFER:
            return
        if time.monotonic() - _last_flush_time < _USAGE_FLUSH_INTERVAL:
            return
        _last_flush_time = time.monotonic()
    _schedule_flush()


async def flush_usage_buffer() -> None:
    """将缓冲区中的用量记录批量写入数据库"""
    global _last_flush_time
    with _USAGE_BUFFER_LOCK:
        if not _USAGE_BUFFER:
            return
        batch = _USAGE_BUFFER[:]
        _USAGE_BUFFER.clear()
        _last_flush_time = time.monotonic()

    try:
        async with async_session() as db:
            db.add_all([
                TokenUsage(
                    model=r["model"],
                    prompt_tokens=r["prompt_tokens"],
                    completion_tokens=r["completion_tokens"],
                    total_tokens=r["total_tokens"],
                    caller=r["caller"],
                )
                for r in batch
            ])
            await db.commit()
            logger.debug("Token 用量批量写入 %d 条", len(batch))
    except Exception as e:
        logger.warning("Token 用量批量写入失败 (%d 条): %s", len(batch), e)


def record_usage_from_response(response, caller: str):
    """从 OpenAI ChatCompletion response 对象中提取 usage 并记录（同步，fire-and-forget）"""
    try:
        usage = getattr(response, "usage", None)
        if usage is None:
            return
        model = getattr(response, "model", "unknown")
        prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
        completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        total_tokens = getattr(usage, "total_tokens", 0) or 0
        _buffer_usage(model, prompt_tokens, completion_tokens, total_tokens, caller)
        _check_periodic_flush()
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
