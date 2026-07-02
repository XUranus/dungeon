#!/usr/bin/env python3
"""回补 talk 中引用但未爬取的嵌入文章"""

import asyncio
import json
import sys
import os

# 添加 backend 到 path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import select, desc
from app.database import async_session, init_db
from app.models import Topic
from app.crawlers.zsxq import ZsxqCrawler


async def find_missing_articles() -> list[tuple[int, str, str]]:
    """返回 (talk_topic_id, article_id, article_url) 列表"""
    async with async_session() as db:
        # 已有的 article
        art_result = await db.execute(
            select(Topic).where(Topic.platform == "zsxq", Topic.content_type == "article")
        )
        existing_ids = set()
        for a in art_result.scalars().all():
            if a.url and "/id_" in a.url:
                aid = a.url.split("/id_")[1].split(".html")[0]
                existing_ids.add(aid)

        # 扫描所有 talk
        result = await db.execute(
            select(Topic)
            .where(Topic.platform == "zsxq", Topic.content_type == "talk")
            .order_by(desc(Topic.published_at))
        )
        talks = result.scalars().all()

        missing = []
        for t in talks:
            raw = t.raw_json or {}
            talk_data = raw.get("talk", {})
            if not isinstance(talk_data, dict):
                continue
            article = talk_data.get("article")
            if not article or not isinstance(article, dict):
                continue
            article_id = article.get("article_id")
            article_url = article.get("article_url")
            if article_id and article_id not in existing_ids:
                missing.append((t.id, article_id, article_url))

        return missing


async def backfill():
    await init_db()
    missing = await find_missing_articles()
    print(f"缺失文章: {len(missing)} 篇")

    if not missing:
        print("无需回补")
        return

    crawler = ZsxqCrawler()
    success = 0
    fail = 0

    async with async_session() as db:
        for i, (talk_id, article_id, article_url) in enumerate(missing, 1):
            try:
                html_content, html_images = await crawler._fetch_article_html(article_id)
                if not html_content:
                    print(f"  [{i}/{len(missing)}] {article_id}: 空内容，跳过")
                    fail += 1
                    continue

                # 获取 talk 的基础信息
                talk_topic = await db.get(Topic, talk_id)
                if not talk_topic:
                    fail += 1
                    continue

                url = article_url or f"https://articles.zsxq.com/id_{article_id}.html"

                # 检查是否已存在（防重复）
                dup = await db.execute(
                    select(Topic).where(Topic.url == url)
                )
                if dup.scalar_one_or_none():
                    print(f"  [{i}/{len(missing)}] {article_id}: 已存在，跳过")
                    continue

                new_topic = Topic(
                    platform="zsxq",
                    platform_topic_id=f"article_{article_id}",
                    title=talk_topic.title,
                    content=html_content,
                    content_type="article",
                    url=url,
                    images=[{"url": u} for u in html_images] if html_images else None,
                    published_at=talk_topic.published_at,
                )
                db.add(new_topic)
                await db.flush()
                success += 1
                print(f"  [{i}/{len(missing)}] {article_id}: ✓ ({len(html_content)} 字)")

            except Exception as e:
                print(f"  [{i}/{len(missing)}] {article_id}: ✗ {e}")
                fail += 1

        await db.commit()

    print(f"\n完成: 成功 {success}, 失败 {fail}, 总计 {len(missing)}")


if __name__ == "__main__":
    asyncio.run(backfill())
