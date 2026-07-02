"""回填脚本：下载 DB 中所有已有的远程图片到本地 data/images/"""

import asyncio
import json
import logging
import sys
from pathlib import Path

# 添加 backend 到 path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.database import async_session, init_db
from app.models import Topic, Comment
from app.services.image_store import download_image, ensure_images_dir
from sqlalchemy import select

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def backfill():
    await init_db()
    ensure_images_dir()

    total_downloaded = 0
    total_skipped = 0
    total_failed = 0

    async with async_session() as db:
        # 处理 topics
        result = await db.execute(
            select(Topic).where(Topic.images.isnot(None))
        )
        topics = result.scalars().all()
        logger.info("待处理 topics: %d", len(topics))

        for topic in topics:
            if not topic.images or not isinstance(topic.images, list):
                continue
            new_imgs = []
            changed = False
            for img in topic.images:
                if not isinstance(img, dict):
                    new_imgs.append(img)
                    continue
                new_img = dict(img)
                if new_img.get("local_path"):
                    total_skipped += 1
                    new_imgs.append(new_img)
                    continue
                url = new_img.get("url")
                if not url:
                    if isinstance(new_img.get("large"), dict):
                        url = new_img["large"].get("url")
                    elif isinstance(new_img.get("thumbnail"), dict):
                        url = new_img["thumbnail"].get("url")
                if not url:
                    new_imgs.append(new_img)
                    continue
                local_path = await download_image(url)
                if local_path:
                    new_img["local_path"] = local_path
                    total_downloaded += 1
                    changed = True
                else:
                    total_failed += 1
                new_imgs.append(new_img)
            if changed:
                topic.images = new_imgs
                await db.flush()

        # 处理 comments
        result = await db.execute(
            select(Comment).where(Comment.images.isnot(None))
        )
        comments = result.scalars().all()
        logger.info("待处理 comments: %d", len(comments))

        for comment in comments:
            if not comment.images or not isinstance(comment.images, list):
                continue
            new_imgs = []
            changed = False
            for img in comment.images:
                if not isinstance(img, dict):
                    new_imgs.append(img)
                    continue
                new_img = dict(img)
                if new_img.get("local_path"):
                    total_skipped += 1
                    new_imgs.append(new_img)
                    continue
                url = new_img.get("url")
                if not url:
                    if isinstance(new_img.get("large"), dict):
                        url = new_img["large"].get("url")
                    elif isinstance(new_img.get("thumbnail"), dict):
                        url = new_img["thumbnail"].get("url")
                if not url:
                    new_imgs.append(new_img)
                    continue
                local_path = await download_image(url)
                if local_path:
                    new_img["local_path"] = local_path
                    total_downloaded += 1
                    changed = True
                else:
                    total_failed += 1
                new_imgs.append(new_img)
            if changed:
                comment.images = new_imgs
                await db.flush()

        await db.commit()

    logger.info("回填完成: 下载 %d, 跳过 %d, 失败 %d", total_downloaded, total_skipped, total_failed)


if __name__ == "__main__":
    asyncio.run(backfill())
