"""NotifyHub 通知推送模块 — 向管理员推送系统异常和致命错误"""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Literal

import httpx

from app.config import settings, PROJECT_ROOT

logger = logging.getLogger(__name__)

# ── 持久化状态文件（容器重启不丢失）──
_STATE_PATH = PROJECT_ROOT / "data" / "notify_state.json"
_notify_cooldown_secs: int = 6 * 3600  # 同一 subject 冷却时间（秒）

# 内存中的状态，启动时从文件加载
_last_sent: dict[str, float] = {}       # subject → last_sent_timestamp
_cookie_expired_flags: dict[str, bool] = {}  # platform → is_expired


def _load_state() -> None:
    """从文件加载持久化状态"""
    try:
        if _STATE_PATH.exists():
            data = json.loads(_STATE_PATH.read_text())
            _last_sent.update(data.get("last_sent", {}))
            _cookie_expired_flags.update(data.get("cookie_expired", {}))
            logger.info("通知状态已加载: %d 条节流记录, %d 个 cookie 失效标记",
                        len(_last_sent), len(_cookie_expired_flags))
    except Exception as e:
        logger.warning("加载通知状态失败: %s", e)


def _save_state() -> None:
    """持久化状态到文件"""
    try:
        _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _STATE_PATH.write_text(json.dumps({
            "last_sent": _last_sent,
            "cookie_expired": _cookie_expired_flags,
        }, ensure_ascii=False, indent=2))
    except Exception as e:
        logger.warning("保存通知状态失败: %s", e)


# 启动时加载
_load_state()


def is_cookie_expired(platform: str) -> bool:
    """检查指定平台的 cookie 是否已标记为失效"""
    return _cookie_expired_flags.get(platform, False)


def mark_cookie_expired(platform: str) -> None:
    """标记平台 cookie 失效"""
    _cookie_expired_flags[platform] = True
    _save_state()
    logger.warning("Cookie 失效标记: %s", platform)


def clear_cookie_expired(platform: str) -> None:
    """清除 cookie 失效标记（cookie 更新后调用）"""
    if _cookie_expired_flags.pop(platform, None):
        _save_state()
        logger.info("Cookie 失效标记已清除: %s", platform)


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
    force: bool = False,
) -> None:
    """发送通知（fire-and-forget，不阻塞调用方）
    同一 subject 在冷却时间内只发送一次，避免重复推送。
    force=True 可跳过节流限制。
    """
    now = time.time()
    if not force:
        last = _last_sent.get(subject, 0)
        if now - last < _notify_cooldown_secs:
            logger.debug("通知被节流跳过（冷却中）: %s", subject)
            return
    _last_sent[subject] = now
    _save_state()
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
