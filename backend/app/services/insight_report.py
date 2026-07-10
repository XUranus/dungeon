"""近期观点总结服务 — 定期调用 LLM 生成 N 天内的观点摘要报告"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, desc, func

from app.config import settings
from app.database import async_session
from app.models import Topic, InsightReport
from app.services.llm_client import get_llm_client
from app.services.token_usage import record_usage_from_response

logger = logging.getLogger(__name__)

# UTC+8 时区
_UTC8 = timezone(timedelta(hours=8))

# ── 时间窗口：每天 07:00-23:00 UTC+8 ──
_ACTIVE_HOUR_START = 7   # UTC+8
_ACTIVE_HOUR_END = 23    # UTC+8（不含）


def _now_utc8() -> datetime:
    return datetime.now(_UTC8)


def is_active_window() -> bool:
    """当前是否在 UTC+8 的 07:00-23:00 活跃窗口内"""
    now = _now_utc8()
    return _ACTIVE_HOUR_START <= now.hour < _ACTIVE_HOUR_END


async def generate_insight_report(ndays: int | None = None) -> dict:
    """生成近期观点总结报告。

    1. 从数据库查询最近 ndays 天内的 Topic
    2. 调用 LLM 生成总结（5000 字以内）
    3. 存储到 insight_reports 表
    """
    if ndays is None:
        ndays = settings.insight_report_ndays

    now = _now_utc8()
    time_start = now - timedelta(days=ndays)
    # 使用 naive datetime 对比（数据库存储的是本地时间）
    time_start_naive = time_start.replace(tzinfo=None)

    # 查询时间范围内的 Topic
    async with async_session() as db:
        result = await db.execute(
            select(Topic)
            .where(Topic.published_at >= time_start_naive)
            .order_by(Topic.published_at.desc())
        )
        topics = result.scalars().all()

    if not topics:
        logger.info("近期观点: 最近 %d 天内无数据，跳过生成", ndays)
        return {"skipped": True, "reason": "no_data", "topic_count": 0}

    topic_count = len(topics)
    logger.info("近期观点: 最近 %d 天共 %d 条数据，开始生成报告", ndays, topic_count)

    # 构建 LLM 输入
    topics_text = _build_topics_text(topics)
    prompt = _build_prompt(ndays, time_start.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d"), topics_text)

    # 调用 LLM
    client = get_llm_client()
    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=100000,
    )
    record_usage_from_response(response, "insight")
    content = response.choices[0].message.content or ""
    # 截断到 5000 字以内
    if len(content) > 5000:
        content = content[:4997] + "..."

    # 收集数据来源信息
    sources = []
    for t in topics:
        sources.append({
            "id": t.id,
            "title": t.title or f"动态 #{t.id}",
            "url": t.url,
            "platform": t.platform,
            "published_at": t.published_at.isoformat() if t.published_at else None,
        })

    # 存储报告
    async with async_session() as db:
        report = InsightReport(
            time_range_start=time_start_naive,
            time_range_end=now.replace(tzinfo=None),
            generated_at=now.replace(tzinfo=None),  # 显式设置 UTC+8 时间，避免 SQLite func.now() 返回 UTC
            topic_count=topic_count,
            content=content,
            sources_json=sources,
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        report_id = report.id

    # 报告事件到插件系统
    from app.plugins.runtime import runtime
    runtime.report_event("recent-insights", "insight_generated", "ok",
                         f"报告已生成: {report_id}, {topic_count} 条来源")

    # 推送通知
    time_range = f"{time_start.strftime('%Y-%m-%d')} ~ {now.strftime('%Y-%m-%d')}"
    from app.services.notify import notify
    notify(
        f"DeepVan最新动态 {time_range}",
        content,
    )

    logger.info("近期观点: 报告已生成 (id=%d, %d 条来源)", report_id, len(sources))
    return {
        "skipped": False,
        "report_id": report_id,
        "topic_count": topic_count,
        "time_range": f"{time_start.strftime('%Y-%m-%d')} ~ {now.strftime('%Y-%m-%d')}",
    }


async def has_new_data_since_last_report() -> bool:
    """检查上次报告后是否有新数据"""
    async with async_session() as db:
        # 获取最新报告的时间
        result = await db.execute(
            select(InsightReport).order_by(desc(InsightReport.id)).limit(1)
        )
        last_report = result.scalar_one_or_none()

        if last_report is None:
            # 从未生成过报告，检查是否有任何数据
            count = (await db.execute(select(func.count(Topic.id)))).scalar() or 0
            return count > 0

        # 检查最新报告生成后是否有新 Topic
        count = (await db.execute(
            select(func.count(Topic.id))
            .where(Topic.crawled_at > last_report.generated_at)
        )).scalar() or 0
        return count > 0


def _build_topics_text(topics: list[Topic]) -> str:
    """将 Topic 列表格式化为 LLM 输入文本"""
    lines = []
    for i, t in enumerate(topics, 1):
        pub = t.published_at.strftime("%Y-%m-%d %H:%M") if t.published_at else "未知时间"
        platform_map = {"zhihu": "知乎", "xueqiu": "雪球", "zsxq": "知识星球", "weibo": "微博", "xiaohongshu": "小红书"}
        platform_label = platform_map.get(t.platform, t.platform)
        content = (t.content or "")[:500]
        title = t.title or ""
        url = t.url or ""
        lines.append(f"[{i}] [{pub}] [{platform_label}] {title}")
        if url:
            lines.append(f"    链接: {url}")
        lines.append(f"    {content}")
        lines.append("")
    return "\n".join(lines)


def _build_prompt(ndays: int, start_date: str, end_date: str, topics_text: str) -> str:
    return f"""请对以下 {ndays} 天内（{start_date} 至 {end_date}）的财经大V观点进行总结。

数据来源说明：每条数据包含发布时间、平台（知乎/雪球/知识星球等）、标题和内容摘要。

要求：
1. 生成 5000 字以内的总结报告
2. 报告开头说明数据的时间范围：{start_date} ~ {end_date}
3. 按主题分类归纳观点（如：宏观经济、行业分析、个股观点、投资策略等）
4. 每个观点引用来源时，使用 markdown 链接格式：[标题](URL)，方便用户点击跳转查看原文
5. 如果某条数据没有 URL，则用标题标注来源即可
6. 使用 markdown 格式，层次清晰

以下是数据内容：

{topics_text}"""
