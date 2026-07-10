"""定时任务调度 — 支持每日定时、间隔循环、观点总结等模式"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.database import async_session
from app.services.ingestion import ingest_all

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _scheduled_crawl():
    """定时爬取任务"""
    logger.info("定时爬取开始")
    try:
        async with async_session() as db:
            tasks = await ingest_all(db)
            for t in tasks:
                logger.info(f"  {t.platform}: +{t.topics_count}主题 +{t.comments_count}评论")
    except Exception as e:
        logger.error(f"定时爬取失败: {e}")
        from app.services.notify import notify
        notify("🔴 定时采集失败", f"错误信息: {str(e)[:200]}")


async def _scheduled_insight_report():
    """定时生成近期观点总结报告"""
    from app.services.insight_report import is_active_window, generate_insight_report, has_new_data_since_last_report

    if not is_active_window():
        logger.debug("近期观点: 当前不在活跃时间窗口 (UTC+8 07:00-23:00)，跳过")
        return

    try:
        has_new = await has_new_data_since_last_report()
        if not has_new:
            logger.info("近期观点: 自上次报告以来无新数据，跳过")
            return

        result = await generate_insight_report()
        if not result.get("skipped"):
            logger.info("近期观点总结已生成: %s", result.get("time_range"))
        else:
            logger.info("近期观点: %s", result.get("reason"))
    except Exception as e:
        logger.error("近期观点总结生成失败: %s", e, exc_info=True)
        from app.services.notify import notify
        notify("🔴 观点总结生成失败", f"错误信息: {str(e)[:200]}")


def _rebuild_insight_report_job(minutes: int):
    """重建近期观点总结定时任务"""
    job_id = "insight_report"
    existing = scheduler.get_job(job_id)
    if existing:
        logger.info("移除旧的 insight_report 任务: %s", existing.trigger)
        scheduler.remove_job(job_id)

    if minutes <= 0:
        logger.info("近期观点总结已关闭")
        return

    scheduler.add_job(
        _scheduled_insight_report,
        trigger=IntervalTrigger(minutes=minutes),
        id=job_id,
        replace_existing=True,
    )
    logger.info("近期观点总结已启动: 每 %d 分钟检查一次", minutes)


def _rebuild_interval_job(minutes: int):
    """重建间隔爬取任务"""
    job_id = "interval_crawl"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if minutes <= 0:
        logger.info("间隔爬取已关闭")
        return

    scheduler.add_job(
        _scheduled_crawl,
        trigger=IntervalTrigger(minutes=minutes),
        id=job_id,
        replace_existing=True,
    )
    logger.info(f"间隔爬取已启动: 每 {minutes} 分钟")


def setup_scheduler():
    """根据配置启动定时任务"""
    # 1. 每日定时（crawl_schedule = "HH:MM"）
    if settings.crawl_schedule:
        try:
            hour, minute = settings.crawl_schedule.split(":")
            scheduler.add_job(
                _scheduled_crawl,
                trigger=CronTrigger(hour=int(hour), minute=int(minute)),
                id="daily_crawl",
                replace_existing=True,
            )
            logger.info(f"每日定时爬取: {settings.crawl_schedule}")
        except ValueError:
            logger.error(f"crawl_schedule 格式错误: {settings.crawl_schedule}，应为 HH:MM")

    # 2. 间隔爬取（crawl_interval_minutes）
    interval = settings.crawl_interval_minutes
    if interval > 0:
        _rebuild_interval_job(interval)

    # 3. 近期观点总结（insight_report_interval_minutes）
    _rebuild_insight_report_job(settings.insight_report_interval_minutes)

    if scheduler.get_jobs():
        scheduler.start()
        logger.info(f"调度器已启动，共 {len(scheduler.get_jobs())} 个任务")
    else:
        logger.info("未配置任何定时任务")


def apply_crawl_interval(minutes: int):
    """热更新间隔爬取配置（settings 已持久化后调用）"""
    _rebuild_interval_job(minutes)
    if minutes > 0 and not scheduler.running:
        scheduler.start()


def apply_insight_report_interval(minutes: int):
    """热更新近期观点总结间隔配置"""
    _rebuild_insight_report_job(minutes)
    if minutes > 0 and not scheduler.running:
        scheduler.start()


def get_scheduler_status() -> dict:
    """返回调度器状态"""
    jobs = []
    if scheduler.running:
        for job in scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "trigger": str(job.trigger),
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            })
    return {
        "running": scheduler.running,
        "jobs": jobs,
        "crawl_interval_minutes": settings.crawl_interval_minutes,
    }


def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
