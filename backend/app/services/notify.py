"""NotifyHub 通知推送模块 — 向管理员推送系统异常和致命错误"""

import asyncio
import logging
from typing import Literal

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def _send_async(
    subject: str,
    body: str,
    fmt: Literal["markdown", "text"] = "markdown",
) -> bool:
    """异步发送通知到 NotifyHub"""
    url = settings.notifyhub_url
    key = settings.notifyhub_key
    if not url or not key:
        logger.debug("NotifyHub 未配置，跳过通知")
        return False

    payload = {
        "channel": "push",
        "to": settings.notifyhub_to,
        "subject": subject,
        "body": body,
        "format": fmt,
        "topic": "dungeon",
    }
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{url.rstrip('/')}/api/v1/send",
                json=payload,
                headers=headers,
            )
            if resp.status_code == 200:
                logger.info("通知已发送: %s", subject)
                return True
            else:
                logger.warning("通知发送失败 [%d]: %s", resp.status_code, resp.text[:200])
                return False
    except Exception as e:
        logger.warning("通知发送异常: %s", e)
        return False


def notify(
    subject: str,
    body: str,
    fmt: Literal["markdown", "text"] = "markdown",
) -> None:
    """发送通知（fire-and-forget，不阻塞调用方）"""
    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(_send_async(subject, body, fmt))
        task.add_done_callback(_log_task_exception)
    except RuntimeError:
        # 无事件循环时同步发送（启动阶段）
        try:
            asyncio.run(_send_async(subject, body, fmt))
        except Exception:
            pass


def _log_task_exception(task: asyncio.Task) -> None:
    """记录后台任务中未处理的异常，避免静默吞掉"""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.warning("通知后台任务异常: %s", exc)
