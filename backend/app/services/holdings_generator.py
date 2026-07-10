"""大V推荐持仓生成服务 — 分析最近爬取的 Topic，提取推荐持仓"""

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import select, delete

from app.config import settings
from app.services.llm_client import get_llm_client
from app.services.token_usage import record_usage_from_response
from app.database import async_session
from app.models import Topic, RecommendedHolding

logger = logging.getLogger(__name__)

GENERATION_PROMPT = """你是一个财经分析助手。请分析以下大V最近发表的财经观点，提取其中提到的股票/基金/ETF等投资标的及其态度。

{topics_text}

请以 JSON 格式返回，格式为 {{"holdings": [...]}}, 每个元素包含：
- stock_name: 标的名称（如"贵州茅台"）
- stock_code: 标的代码（如"600519"，如果没有明确代码则为 null）
- sentiment: 态度，"bullish"（看多）| "bearish"（看空）| "neutral"（中性/观望）
- reason: 推荐理由，一句话概括（30字以内）
- source_kols: 提到该标的的大V名称列表
- confidence: 置信度 0-1（根据提及次数和明确程度判断）

注意：
1. 只提取有明确态度的标的，不要推测
2. 如果没有提到任何投资标的，返回空数组 []
3. 只返回 JSON 数组，不要有其他文字"""


async def generate_holdings(days: int = 7, max_topics: int = 50) -> list[dict]:
    """分析最近 N 天的 Topic，生成推荐持仓。

    Returns:
        生成的持仓列表（已写入数据库）
    """
    async with async_session() as db:
        cutoff = datetime.utcnow() - timedelta(days=days)
        result = await db.execute(
            select(Topic)
            .where(Topic.published_at >= cutoff)
            .order_by(Topic.published_at.desc())
            .limit(max_topics)
        )
        topics = result.scalars().all()

    if not topics:
        logger.info("最近 %d 天没有 Topic，跳过持仓生成", days)
        return []

    # 构造 topic 文本
    platform_names = {
        "zhihu": "知乎", "xueqiu": "雪球", "xiaohongshu": "小红书",
        "weibo": "微博", "douyin": "抖音", "zsxq": "知识星球",
    }
    topics_text_parts = []
    for i, t in enumerate(topics, 1):
        pname = platform_names.get(t.platform, t.platform)
        date_str = t.published_at.strftime("%Y-%m-%d") if t.published_at else "未知日期"
        author = ""
        if t.raw_json and isinstance(t.raw_json, dict):
            author = t.raw_json.get("author", {}).get("name", "") if isinstance(t.raw_json.get("author"), dict) else ""
        header = f"[{i}] [{pname}] {date_str}"
        if author:
            header += f" @{author}"
        if t.title:
            header += f" — {t.title}"
        content_preview = t.content[:500]
        if len(t.content) > 500:
            content_preview += "..."
        topics_text_parts.append(f"{header}\n{content_preview}")

    topics_text = "\n\n".join(topics_text_parts)
    prompt = GENERATION_PROMPT.format(topics_text=topics_text)

    # 调用 LLM
    client = get_llm_client()

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "你是一个严谨的财经分析助手，只基于提供的数据提取信息。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        record_usage_from_response(response, "holdings")
    except Exception:
        logger.exception("LLM 调用失败（持仓生成）")
        return []

    raw_text = response.choices[0].message.content or ""
    logger.info("持仓生成 LLM 返回: %s", raw_text[:500])

    # 解析 JSON
    try:
        parsed = json.loads(raw_text)
        # 兼容 {"holdings": [...]} 或 {"analysis": [...]} 或直接 [...]
        if isinstance(parsed, dict):
            holdings_data = parsed.get("holdings", parsed.get("results", parsed.get("analysis", [])))
            # 如果还是没找到，取第一个数组类型的值
            if not holdings_data:
                for v in parsed.values():
                    if isinstance(v, list):
                        holdings_data = v
                        break
        elif isinstance(parsed, list):
            holdings_data = parsed
        else:
            holdings_data = []
    except json.JSONDecodeError:
        logger.warning("LLM 返回的 JSON 解析失败: %s", raw_text[:300])
        return []

    if not holdings_data:
        logger.info("未提取到推荐持仓，parsed keys: %s", list(parsed.keys()) if isinstance(parsed, dict) else "not a dict")
        return []

    logger.info("解析到 %d 条持仓数据", len(holdings_data))

    # 收集 source topic ids
    source_topic_ids = [t.id for t in topics[:10]]

    # 写入数据库（先清空旧数据）
    async with async_session() as db:
        await db.execute(delete(RecommendedHolding))
        created = []
        for item in holdings_data:
            if not isinstance(item, dict) or not item.get("stock_name"):
                continue
            holding = RecommendedHolding(
                stock_name=item["stock_name"],
                stock_code=item.get("stock_code"),
                sentiment=item.get("sentiment", "neutral"),
                reason=item.get("reason", ""),
                source_topic_ids=source_topic_ids,
                source_kols=item.get("source_kols", []),
                confidence=float(item.get("confidence", 0.5)),
            )
            db.add(holding)
            created.append(item)
        await db.commit()
        logger.info("已生成 %d 条推荐持仓", len(created))

    return created
