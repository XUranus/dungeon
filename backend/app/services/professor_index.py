"""教授指数解析服务 — 从历史 Topic 中提取教授指数持仓配置（支持图片多模态识别）"""

import json
import logging
from datetime import datetime

from sqlalchemy import select, desc, or_

from app.config import settings
from app.services.llm_client import get_llm_client
from app.database import async_session
from app.models import Topic, ProfessorIndexSnapshot, ProfessorIndexHolding

logger = logging.getLogger(__name__)

# ── 关键词列表（教授指数 / 叫兽指数） ──
_KEYWORDS = ["教授指数", "叫兽指数"]

PARSE_PROMPT = """你是教授指数的持仓解析助手。以下是星主 DeepVan 在知识星球中关于"叫兽指数"（也称"教授指数"）的历史文章和发言记录。
其中 [文章] 标记的是专栏正式文章（最权威的数据源），[Q&A] 是问答互动。
部分条目附带了 [图片描述]，可能包含持仓明细表、调仓记录截图等关键信息。

请综合所有信息，提取叫兽指数的**最新**持仓配置，分"内地版"和"全球版"两个版本。

{topics_text}

请以 JSON 格式返回，格式为：
{{
  "china": {{
    "holdings": [
      {{"name": "标的名称", "code": "代码或null", "market": "A股/港股/基金", "weight": 百分比数字或null}}
    ],
    "notes": "最近调仓说明（一两句话，包括净值等关键数据）"
  }},
  "global": {{
    "holdings": [
      {{"name": "标的名称", "code": "代码或null", "market": "美股/日股/港股", "weight": 百分比数字或null}}
    ],
    "notes": "最近调仓说明（一两句话，包括净值等关键数据）"
  }}
}}

规则：
1. 以最新的文章/发言为准。如果新文章说"调仓"，则以新的持仓列表覆盖旧的
2. 权重百分比：从图片持仓表或文中提取；如果没有明确百分比则为 null
3. 标的代码尽量补充（A股6位数字如000001，港股如03441.HK，美股直接ticker如SPY/AMD）
4. market 字段只能是: A股 / 美股 / 港股 / 日股 / 基金
5. 如果某个版本找不到任何信息，holdings 返回空数组
6. 从图片描述中识别的持仓表格也要纳入，注意区分内地版和全球版
7. 只返回 JSON，不要有其他文字"""


def _extract_image_urls(topic: Topic) -> list[str]:
    """从 Topic 的 images 字段提取所有可用的图片 URL"""
    images = topic.images
    if not images or not isinstance(images, list):
        return []
    urls = []
    for img in images:
        if not isinstance(img, dict):
            continue
        url = None
        if "large" in img and isinstance(img["large"], dict):
            url = img["large"].get("url")
        elif "thumbnail" in img and isinstance(img["thumbnail"], dict):
            url = img["thumbnail"].get("url")
        elif "url" in img:
            url = img["url"]
        if url:
            urls.append(url)
    return urls


async def _describe_images(image_urls: list[str]) -> list[str]:
    """用多模态 LLM 识别图片内容，返回描述列表"""
    if not image_urls:
        return []

    vision_model = settings.vision_model or settings.openai_model
    client = get_llm_client()

    descriptions = []
    for url in image_urls[:3]:  # 最多 3 张
        try:
            response = await client.chat.completions.create(
                model=vision_model,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "这是一张来自财经投资社区的截图，可能包含投资组合持仓、基金配置、"
                                "收益曲线、调仓记录等信息。请详细描述图片中的所有持仓信息，"
                                "包括：标的名称、代码、持仓比例/权重、所属市场（A股/港股/美股/日股）。"
                                "如果是表格或列表，请逐项列出。用中文回答。"
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": url}},
                    ],
                }],
                max_tokens=800,
                temperature=0.1,
            )
            desc = response.choices[0].message.content
            if desc:
                descriptions.append(desc.strip())
        except Exception as e:
            logger.debug("图片识别失败: %s: %s", url[:80], e)

        # 图片间延迟，避免触发限流
        import asyncio
        await asyncio.sleep(1)

    return descriptions


async def find_professor_index_topics() -> list[Topic]:
    """查找所有教授指数相关 Topic（关键词匹配 + 专栏文章），按时间倒序。
    优先返回专栏文章（权威数据源），再补充关键词匹配的 Q&A。"""
    keyword_conditions = [Topic.title.contains(kw) for kw in _KEYWORDS]
    keyword_conditions += [Topic.content.contains(kw) for kw in _KEYWORDS]

    async with async_session() as db:
        # 1. zsxq 专栏文章（权威数据源，优先级最高）
        article_result = await db.execute(
            select(Topic)
            .where(Topic.platform == "zsxq", Topic.content_type == "article")
            .order_by(desc(Topic.published_at))
            .limit(100)
        )
        articles = list(article_result.scalars().all())
        seen_ids = {t.id for t in articles}

        # 2. 关键词匹配的 Q&A/talk（补充上下文）
        keyword_result = await db.execute(
            select(Topic)
            .where(or_(*keyword_conditions))
            .order_by(desc(Topic.published_at))
            .limit(50)
        )
        extras = [t for t in keyword_result.scalars().all() if t.id not in seen_ids]

        # 文章在前，Q&A 在后（LLM 优先看到最新文章）
        return articles + extras


async def parse_professor_index(topics: list[Topic]) -> dict:
    """调用 LLM 从文章 + 图片中提取教授指数持仓"""
    if not topics:
        return {"china": {"holdings": [], "notes": ""}, "global": {"holdings": [], "notes": ""}}

    platform_names = {"zhihu": "知乎", "zsxq": "知识星球"}

    # 只对最新的文章做图片识别（控制 API 调用量）
    image_tasks: list[tuple[int, list[str]]] = []  # (index, urls)
    for i, t in enumerate(topics[:8]):
        urls = _extract_image_urls(t)
        if urls:
            image_tasks.append((i, urls))

    # 识别图片（限流：最多 2 个并发，每次间隔 1s）
    image_descriptions: dict[int, list[str]] = {}
    if image_tasks:
        import asyncio
        sem = asyncio.Semaphore(2)

        async def _process_images(idx: int, urls: list[str]):
            async with sem:
                descs = await _describe_images(urls)
                if descs:
                    image_descriptions[idx] = descs
                await asyncio.sleep(1)

        await asyncio.gather(*[_process_images(idx, urls) for idx, urls in image_tasks])

    # 构造文本
    parts = []
    for i, t in enumerate(topics, 1):
        idx = i - 1  # 0-based index for image_descriptions
        pname = platform_names.get(t.platform, t.platform)
        date_str = t.published_at.strftime("%Y-%m-%d") if t.published_at else "未知"
        title = t.title or ""
        content = t.content or ""
        # 标记内容类型：文章 vs Q&A
        type_label = "文章" if t.content_type == "article" else "Q&A"
        text = f"[{i}] [{type_label}] [{pname}] {date_str} — {title}\n{content}"

        # 追加图片描述
        if idx in image_descriptions:
            for j, desc in enumerate(image_descriptions[idx], 1):
                text += f"\n\n[图片{j}内容]\n{desc}"

        parts.append(text)

    topics_text = "\n\n---\n\n".join(parts)
    prompt = PARSE_PROMPT.format(topics_text=topics_text)

    # 如果文本过长，截断后面的旧内容（文章在前，优先保留）
    max_chars = 80000
    if len(prompt) > max_chars:
        # 找到最近一个完整分隔符位置截断
        cut = prompt.rfind("\n\n---\n\n", 0, max_chars)
        if cut > max_chars // 2:
            prompt = prompt[:cut] + "\n\n...(旧内容已省略)"
        else:
            prompt = prompt[:max_chars] + "\n\n...(内容过长已截断)"

    client = get_llm_client()
    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "你是一个严谨的财经分析助手。只基于提供的数据提取信息，返回纯 JSON。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
    except Exception:
        logger.exception("LLM 调用失败（教授指数解析）")
        return {"china": {"holdings": [], "notes": ""}, "global": {"holdings": [], "notes": ""}}

    raw_text = response.choices[0].message.content or ""
    logger.info("教授指数 LLM 返回: %s", raw_text[:500])

    try:
        parsed = json.loads(raw_text)
        china = parsed.get("china", parsed.get("内地版", {"holdings": [], "notes": ""}))
        glob = parsed.get("global", parsed.get("全球版", {"holdings": [], "notes": ""}))
        if isinstance(china, list):
            china = {"holdings": china, "notes": ""}
        if isinstance(glob, list):
            glob = {"holdings": glob, "notes": ""}
        return {"china": china, "global": glob}
    except json.JSONDecodeError:
        logger.warning("教授指数 JSON 解析失败: %s", raw_text[:300])
        return {"china": {"holdings": [], "notes": ""}, "global": {"holdings": [], "notes": ""}}


async def update_professor_index() -> dict:
    """主入口：查找教授指数文章 → 图片识别 → LLM 解析 → 写入数据库"""
    topics = await find_professor_index_topics()
    if not topics:
        logger.info("未找到教授指数相关文章")
        return {"china": [], "global": [], "message": "未找到教授指数相关文章"}

    logger.info("找到 %d 篇教授指数相关文章，开始解析...", len(topics))
    source_ids = [t.id for t in topics]
    result = await parse_professor_index(topics)

    saved = {"china": [], "global": []}

    async with async_session() as db:
        for version_key, version_label in [("china", "内地版"), ("global", "全球版")]:
            data = result.get(version_key, {})
            holdings = data.get("holdings", [])
            notes = data.get("notes", "")

            if not holdings:
                logger.info("教授指数 %s: 无持仓数据", version_label)
                continue

            snapshot = ProfessorIndexSnapshot(
                version=version_label,
                source_topic_ids=source_ids,
                holdings=holdings,
                notes=notes,
            )
            db.add(snapshot)
            await db.flush()

            for h in holdings:
                if not isinstance(h, dict) or not h.get("name"):
                    continue
                holding = ProfessorIndexHolding(
                    snapshot_id=snapshot.id,
                    version=version_label,
                    stock_name=h["name"],
                    stock_code=h.get("code"),
                    market=h.get("market", "未知"),
                    weight=h.get("weight"),
                )
                db.add(holding)
                saved[version_key].append(h["name"])

            logger.info("教授指数 %s: 保存 %d 条持仓", version_label, len(saved[version_key]))

        await db.commit()

    return {**saved, "message": f"解析完成: 内地版 {len(saved['china'])} 项, 全球版 {len(saved['global'])} 项"}


async def get_latest_snapshots() -> dict:
    """获取最新的教授指数快照（内地版 + 全球版各一条）"""
    async with async_session() as db:
        result = {}
        for version_label in ["内地版", "全球版"]:
            snap_result = await db.execute(
                select(ProfessorIndexSnapshot)
                .where(ProfessorIndexSnapshot.version == version_label)
                .order_by(desc(ProfessorIndexSnapshot.snapshot_at))
                .limit(1)
            )
            snap = snap_result.scalar_one_or_none()
            if snap:
                holdings_result = await db.execute(
                    select(ProfessorIndexHolding)
                    .where(ProfessorIndexHolding.snapshot_id == snap.id)
                    .order_by(ProfessorIndexHolding.id)
                )
                holdings = holdings_result.scalars().all()
                result[version_label] = {
                    "snapshot_id": snap.id,
                    "snapshot_at": snap.snapshot_at.isoformat() if snap.snapshot_at else None,
                    "notes": snap.notes,
                    "holdings": [
                        {
                            "name": h.stock_name,
                            "code": h.stock_code,
                            "market": h.market,
                            "weight": h.weight,
                        }
                        for h in holdings
                    ],
                }
            else:
                result[version_label] = None

        return result
