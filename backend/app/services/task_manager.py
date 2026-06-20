"""异步爬取任务管理器 — 同一时刻最多一个任务运行"""

import asyncio
import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# 当前运行任务的状态 (全局单例)
_running: dict | None = None

# 空闲状态
_IDLE = {"status": "idle"}


def is_running() -> bool:
    return _running is not None


def get_status() -> dict:
    """返回当前任务状态，无任务返回 {"status": "idle"}"""
    if _running is None:
        return _IDLE
    return {
        "task_id": _running["task_id"],
        "platform": _running["platform"],
        "status": _running["status"],
        "progress": dict(_running["progress"]),
        "started_at": _running["started_at"].isoformat(),
        "finished_at": _running["finished_at"].isoformat() if _running["finished_at"] else None,
        "error": _running["error"],
    }


def _update_progress(**kwargs):
    """由 ingestion 回调，更新进度"""
    if _running is None:
        return
    _running["progress"].update(kwargs)


def start_crawl(platform: str, crawl_func, db_factory, full_crawl: bool = False) -> dict:
    """启动异步爬取任务。如已有任务运行返回 None。"""
    global _running
    if _running is not None:
        return None

    task_id = str(uuid.uuid4())[:8]
    _running = {
        "task_id": task_id,
        "platform": platform,
        "status": "running",
        "progress": {
            "phase": "starting",
            "topics_found": 0,
            "topics_saved": 0,
            "comments_saved": 0,
        },
        "started_at": datetime.now(),
        "finished_at": None,
        "error": None,
    }

    logger.info(f"[task_manager] 启动爬取任务: {task_id}, platform={platform}, full_crawl={full_crawl}")

    async def _run():
        global _running
        try:
            # 每个异步任务需要自己的 db session
            async with db_factory() as db:
                await crawl_func(db, platform, progress_callback=_update_progress, full_crawl=full_crawl)
            _running["status"] = "done"
            _running["finished_at"] = datetime.now()
            logger.info(f"[task_manager] 任务完成: {task_id}")
        except Exception as e:
            _running["status"] = "error"
            _running["error"] = str(e)[:500]
            _running["finished_at"] = datetime.now()
            logger.error(f"[task_manager] 任务失败: {task_id}, error={e}", exc_info=True)
        finally:
            # 5 秒后清空状态，允许新任务
            await asyncio.sleep(5)
            _running = None

    asyncio.create_task(_run())
    return {"task_id": task_id, "platform": platform, "status": "running"}
