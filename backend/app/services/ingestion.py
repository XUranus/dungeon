"""数据采集服务 - 将爬取数据存入SQLite + ChromaDB"""

import re
import logging
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Topic, Comment, CrawlTask, SemanticChunk
from app.crawlers.base import BaseCrawler
from app.crawlers.zsxq import ZsxqCrawler
from app.crawlers.zhihu import ZhihuCrawler
from app.config import settings
from app.services.embedding import get_embeddings
from app.services.vectorstore import add_documents
from app.utils.text import split_text_to_chunks

logger = logging.getLogger(__name__)


def get_enabled_platforms() -> list[str]:
    """返回已配置Cookie的平台列表"""
    platforms: list[str] = []
    if settings.zsxq_cookie and settings.zsxq_group_id:
        platforms.append("zsxq")
    if settings.zhihu_cookie and settings.zhihu_url_token:
        platforms.append("zhihu")
    return platforms


def get_crawler(platform: str) -> BaseCrawler:
    if platform == "zsxq":
        return ZsxqCrawler()
    elif platform == "zhihu":
        return ZhihuCrawler()
    else:
        raise ValueError(f"不支持的平台: {platform}")


def get_url_token(platform: str) -> str:
    if platform == "zsxq":
        return settings.zsxq_group_id
    elif platform == "zhihu":
        return settings.zhihu_url_token
    raise ValueError(f"不支持的平台: {platform}")


# ──────────────────────────── 文本预处理 ────────────────────────────

def _preprocess_content(topic: Topic) -> str:
    """在 embedding 前对文本做结构化改写，提升检索质量"""
    content = topic.content
    platform = topic.platform
    ct = topic.content_type

    # 清理 HTML 残留
    content = _clean_html(content)

    if platform == "zsxq" and ct == "q&a":
        # ZSXQ Q&A: 结构化改写为 "提问: ... 回答: ..."
        content = _reformat_zsxq_qa(content, topic.title)
    elif platform == "zhihu" and ct == "answer":
        # 知乎回答: 加上问题标题
        if topic.title:
            content = f"问题: {topic.title}\n\n回答: {content}"
    elif platform == "zhihu" and ct == "pin":
        # 知乎想法: 清理 HTML
        content = re.sub(r'<br\s*/?>', '\n', content)
        content = re.sub(r'<a[^>]*>[^<]*</a>', '', content)

    return content.strip()


def _clean_html(text: str) -> str:
    """清理 HTML 标签残留"""
    text = re.sub(r'<e[^>]*/?>', '', text)  # ZSXQ <e> 标记
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _reformat_zsxq_qa(content: str, title: str | None) -> str:
    """将 ZSXQ Q&A 格式改写为更清晰的结构"""
    # 已有 [提问]/[回答] 标记的，改写为更清晰格式
    if '[提问]' in content or '[回答]' in content:
        # 提取提问者和回答者
        content = re.sub(r'\[提问\]\s*(\S+?):', r'提问者: \1\n问题:', content)
        content = re.sub(r'\[回答\]\s*(\S+?):', r'\n\n回答者: \1\n回答:', content)
        content = re.sub(r'\[提问\]:', '问题:', content)
        content = re.sub(r'\[回答\]:', '\n\n回答:', content)
    return content


async def _describe_images(topic: Topic) -> str:
    """用 LLM 多模态能力将图片转为文字描述"""
    if not settings.vision_model:
        return ""

    images = topic.images
    if not images or not isinstance(images, list):
        return ""

    # 只处理前 3 张图片（控制成本）
    image_urls = []
    for img in images[:3]:
        url = None
        if isinstance(img, dict):
            # ZSXQ: 优先 large > thumbnail
            if "large" in img and isinstance(img["large"], dict):
                url = img["large"].get("url")
            elif "thumbnail" in img and isinstance(img["thumbnail"], dict):
                url = img["thumbnail"].get("url")
            elif "url" in img:
                url = img["url"]
        if url:
            image_urls.append(url)

    if not image_urls:
        return ""

    try:
        from openai import AsyncOpenAI
        client_kwargs: dict = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            client_kwargs["base_url"] = settings.openai_base_url
        client = AsyncOpenAI(**client_kwargs)

        descriptions = []
        for url in image_urls:
            try:
                response = await client.chat.completions.create(
                    model=settings.vision_model,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "简要描述这张图片的内容，特别是与财经、投资、数据、图表相关的部分。用中文回答，不超过100字。"},
                            {"type": "image_url", "image_url": {"url": url}},
                        ],
                    }],
                    max_tokens=200,
                    temperature=0.1,
                )
                desc = response.choices[0].message.content
                if desc:
                    descriptions.append(desc.strip())
            except Exception as e:
                logger.debug(f"图片描述失败: {url}: {e}")

        if descriptions:
            return "\n\n[图片描述]\n" + "\n".join(f"{i+1}. {d}" for i, d in enumerate(descriptions))
    except Exception as e:
        logger.warning(f"图片描述服务异常: {e}")

    return ""


# ──────────────────────────── 平台爬取 ────────────────────────────

async def ingest_platform(db: AsyncSession, platform: str, progress_callback=None, full_crawl: bool = False) -> CrawlTask:
    """采集指定平台的数据。full_crawl=True 时跳过增量逻辑，从头爬取。"""
    task = CrawlTask(
        platform=platform,
        status="running",
        started_at=datetime.now(),
    )
    db.add(task)
    await db.flush()
    logger.info(f"[{platform}] 爬取任务开始, task_id={task.id}")

    crawler = get_crawler(platform)
    url_token = get_url_token(platform)

    try:
        # 增量/全量判断
        if full_crawl:
            since = None
            logger.info(f"[{platform}] 全量模式: 强制从头爬取")
        else:
            last_topic_result = await db.execute(
                select(Topic)
                .where(Topic.platform == platform)
                .order_by(Topic.published_at.desc())
                .limit(1)
            )
            last = last_topic_result.scalar_one_or_none()
            since = last.published_at if last else None
            if since:
                logger.info(f"[{platform}] 增量模式: since={since}")
            else:
                logger.info(f"[{platform}] 全量模式: 首次爬取")

        crawl_result = await crawler.crawl_topics(url_token, since=since)
        if isinstance(crawl_result, tuple):
            crawled_topics, embedded_comments = crawl_result
        else:
            crawled_topics, embedded_comments = crawl_result, []
        logger.info(f"[{platform}] 爬取到 {len(crawled_topics)} 条主题, 内嵌评论{len(embedded_comments)}条, 开始入库...")
        if progress_callback:
            progress_callback(phase="saving", topics_found=len(crawled_topics))

        topics_count = 0
        topics_dup = 0
        comments_count = 0
        comments_dup = 0
        comments_err = 0

        all_embedded = {ec.platform_comment_id: ec for ec in embedded_comments}

        for i, ct in enumerate(crawled_topics):
            with db.no_autoflush:
                existing = await db.execute(
                    select(Topic.id).where(
                        Topic.platform == platform,
                        Topic.platform_topic_id == ct.platform_topic_id,
                    ).limit(1)
                )
                if existing.first():
                    topics_dup += 1
                    continue

            topic = Topic(
                platform=platform,
                platform_topic_id=ct.platform_topic_id,
                title=ct.title,
                content=ct.content,
                content_type=ct.content_type,
                url=ct.url,
                like_count=ct.like_count,
                comment_count=ct.comment_count,
                images=ct.images or None,
                raw_json=ct.raw_json,
                published_at=ct.published_at,
            )
            db.add(topic)
            await db.flush()
            topics_count += 1

            try:
                crawled_comments: list = []
                try:
                    crawled_comments = await crawler.crawl_comments(
                        ct.platform_topic_id,
                        content_type=ct.content_type,
                    )
                except Exception as e:
                    logger.warning(f"[{platform}] 评论API失败, 尝试用内嵌评论: topic={ct.platform_topic_id}, error={e}")

                seen_ids: set[str] = set()
                for cc in crawled_comments:
                    if cc.platform_comment_id in seen_ids:
                        continue
                    seen_ids.add(cc.platform_comment_id)
                    with db.no_autoflush:
                        existing = await db.execute(
                            select(Comment.id).where(
                                Comment.platform == platform,
                                Comment.platform_comment_id == cc.platform_comment_id,
                            ).limit(1)
                        )
                        if existing.first():
                            comments_dup += 1
                            continue
                    db.add(Comment(
                        topic_id=topic.id,
                        platform=platform,
                        platform_comment_id=cc.platform_comment_id,
                        author_name=cc.author_name,
                        content=cc.content,
                        like_count=cc.like_count,
                        images=cc.images or None,
                        raw_json=cc.raw_json,
                        published_at=cc.published_at,
                    ))
                    comments_count += 1
            except Exception as e:
                comments_err += 1
                logger.warning(f"[{platform}] 评论爬取失败: topic={ct.platform_topic_id}, error={e}")

            from sqlalchemy import func as sa_func
            actual_count_result = await db.execute(
                select(sa_func.count()).where(Comment.topic_id == topic.id)
            )
            topic.comment_count = actual_count_result.scalar() or 0

            if (i + 1) % 10 == 0:
                logger.info(f"[{platform}] 进度: {i+1}/{len(crawled_topics)} 主题入库, 新增{topics_count}条(去重{topics_dup}), 评论新增{comments_count}条(去重{comments_dup})")
                if progress_callback:
                    progress_callback(topics_saved=topics_count, comments_saved=comments_count)

        logger.info(
            f"[{platform}] 入库完成: 主题新增{topics_count}条(去重{topics_dup}), "
            f"评论新增{comments_count}条(去重{comments_dup}, 失败{comments_err})"
        )
        if progress_callback:
            progress_callback(phase="done", topics_saved=topics_count, comments_saved=comments_count)

        try:
            await _embed_new_content(db, platform)
        except Exception as e:
            logger.warning(f"[{platform}] Embedding失败(不影响爬取): {e}")

        task.status = "done"
        task.topics_count = topics_count
        task.comments_count = comments_count
        task.finished_at = datetime.now()
        await db.commit()

        elapsed = (task.finished_at - task.started_at).total_seconds()
        logger.info(f"[{platform}] 任务完成, 耗时{elapsed:.1f}s, 新增主题{topics_count}, 评论{comments_count}")

    except Exception as e:
        task.status = "error"
        task.error_message = str(e)[:1000]
        task.finished_at = datetime.now()
        await db.commit()
        logger.error(f"[{platform}] 任务失败: {e}", exc_info=True)
        raise
    finally:
        await crawler.close()

    return task


async def ingest_all(db: AsyncSession) -> list[CrawlTask]:
    """采集所有已配置平台的数据"""
    platforms = get_enabled_platforms()
    logger.info(f"开始全平台爬取: {platforms}")
    tasks: list[CrawlTask] = []
    for platform in platforms:
        task = await ingest_platform(db, platform)
        tasks.append(task)
    return tasks


async def _embed_new_content(db: AsyncSession, platform: str):
    """将新爬取的内容预处理、切分、embedding后存入ChromaDB"""
    embedded_ids_result = await db.execute(
        select(SemanticChunk.source_id).where(SemanticChunk.source_type == "topic")
    )
    embedded_ids = {row[0] for row in embedded_ids_result.all()}

    topics_result = await db.execute(
        select(Topic).where(Topic.platform == platform)
    )
    topics = topics_result.scalars().all()

    all_texts: list[str] = []
    all_metadatas: list[dict] = []
    all_chunk_records: list[tuple[int, str, int, str]] = []

    for topic in topics:
        if topic.id in embedded_ids:
            continue

        # 预处理文本
        full_text = _preprocess_content(topic)

        # 图片转文字（如果配置了 vision_model）
        image_desc = await _describe_images(topic)
        if image_desc:
            full_text += image_desc

        if not full_text.strip():
            continue

        chunks = split_text_to_chunks(
            full_text,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        for idx, chunk_text in enumerate(chunks):
            chroma_id = f"topic_{topic.id}_chunk_{idx}"
            all_texts.append(chunk_text)
            all_metadatas.append({
                "author_name": settings.author_name,
                "platform": platform,
                "source_type": "topic",
                "source_id": topic.id,
                "content_type": topic.content_type,
                "published_at": topic.published_at.isoformat() if topic.published_at else "",
                "topic_title": topic.title or "",
                "url": topic.url or "",
            })
            all_chunk_records.append((topic.id, chunk_text, idx, chroma_id))

    if not all_texts:
        logger.info(f"[{platform}] 无新内容需要embedding")
        return

    logger.info(f"[{platform}] 开始embedding: {len(all_texts)}个chunk")
    embeddings = await get_embeddings(all_texts)
    ids = [r[3] for r in all_chunk_records]
    add_documents(ids=ids, documents=all_texts, embeddings=embeddings, metadatas=all_metadatas)

    for source_id, chunk_text, chunk_index, chroma_id in all_chunk_records:
        db.add(SemanticChunk(
            source_type="topic",
            source_id=source_id,
            chunk_index=chunk_index,
            chunk_text=chunk_text,
            chroma_id=chroma_id,
        ))

    await db.flush()
    logger.info(f"[{platform}] Embedding完成: {len(all_texts)}个chunk已写入ChromaDB")

    # 同步更新 BM25 索引
    if settings.enable_bm25:
        from app.services.hybrid_retriever import add_to_bm25_index
        add_to_bm25_index(ids, all_texts, all_metadatas)
        logger.info(f"[{platform}] BM25 索引已更新")
