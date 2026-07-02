"""回填知识星球精华文章标记

用法:
    cd backend && .venv/bin/python -m scripts.backfill_digests
"""

import asyncio
import sys
from pathlib import Path

# 项目根目录
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.database import async_session, init_db
from app.models import Topic
from app.crawlers.zsxq import ZsxqCrawler
from app.config import settings
from sqlalchemy import select, update


async def backfill():
    await init_db()

    group_id = settings.zsxq_group_id
    if not group_id:
        print("错误: zsxq_group_id 未配置")
        return

    crawler = ZsxqCrawler()

    print(f"获取精华文章列表: group_id={group_id}")
    digest_ids = await crawler.fetch_digest_ids(group_id, count=500)
    await crawler.close()

    if not digest_ids:
        print("未获取到精华文章")
        return

    print(f"获取到 {len(digest_ids)} 篇精华文章")

    async with async_session() as db:
        # 查询所有 zsxq 主题
        result = await db.execute(
            select(Topic.id, Topic.platform_topic_id)
            .where(Topic.platform == "zsxq")
        )
        topics = result.all()

        updated = 0
        for topic_id, platform_topic_id in topics:
            is_digest = platform_topic_id in digest_ids
            if is_digest:
                await db.execute(
                    update(Topic)
                    .where(Topic.id == topic_id)
                    .values(is_digest=True)
                )
                updated += 1

        await db.commit()
        print(f"已标记 {updated} 篇精华文章 (共 {len(topics)} 条 zsxq 主题)")


if __name__ == "__main__":
    asyncio.run(backfill())
