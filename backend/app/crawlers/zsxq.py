"""知识星球爬虫

参考: https://github.com/yiancode/zsxq-sdk
知识星球使用Cookie认证, 没有公开API。
主要接口:
  - GET /api/v2/groups/{group_id}/topics
  - GET /api/v2/topics/{topic_id}/comments
"""

import httpx
import asyncio
import random
import logging
from datetime import datetime

from app.crawlers.base import BaseCrawler, CrawledTopic, CrawledComment, CrawledKOLProfile
from app.config import settings

logger = logging.getLogger(__name__)

ZSXQ_API_BASE = "https://api.zsxq.com/v2"

ZSXQ_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Origin": "https://wx.zsxq.com",
    "Referer": "https://wx.zsxq.com/",
    "Content-Type": "application/json",
}

# 请求间隔 (秒)
REQUEST_DELAY_MIN = 1.5
REQUEST_DELAY_MAX = 3.5

# 重试配置
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 5  # 秒

# 空页容忍: 连续空页达到此次数才判定翻完
MAX_EMPTY_PAGES = 3


class ZsxqCrawler(BaseCrawler):
    """知识星球爬虫"""

    platform = "zsxq"

    def __init__(self, cookie: str | None = None):
        self.cookie = cookie or settings.zsxq_cookie
        self.headers = {**ZSXQ_HEADERS, "Cookie": self.cookie}
        self.client = httpx.AsyncClient(
            base_url=ZSXQ_API_BASE,
            headers=self.headers,
            timeout=30.0,
        )
        logger.info("知识星球爬虫初始化完成")

    async def close(self):
        await self.client.aclose()
        logger.debug("知识星球HTTP客户端已关闭")

    async def _delay(self):
        delay = random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX)
        await asyncio.sleep(delay)

    async def _request_with_retry(self, method: str, url: str, **kwargs) -> httpx.Response:
        """带重试和日志的HTTP请求"""
        last_exc: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = await self.client.request(method, url, **kwargs)
                if resp.status_code == 429:
                    wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    logger.warning(f"[zsxq] 429 限流, 等待{wait}s后重试 ({attempt}/{MAX_RETRIES}): {url}")
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                if status in (401, 403):
                    logger.error(f"[zsxq] {status} 认证失败, 请检查Cookie是否过期")
                    raise
                if status >= 500 and attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    logger.warning(f"[zsxq] {status} 服务端错误, {wait}s后重试 ({attempt}/{MAX_RETRIES}): {url}")
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                logger.error(f"[zsxq] HTTP {status}: {url}")
                raise
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
                if attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    logger.warning(f"[zsxq] {type(e).__name__}, {wait}s后重试 ({attempt}/{MAX_RETRIES}): {url}")
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                logger.error(f"[zsxq] 网络异常, 已重试{MAX_RETRIES}次仍失败: {type(e).__name__}")
                raise
        raise last_exc  # type: ignore[misc]

    async def crawl_kol_profile(self, group_id: str) -> CrawledKOLProfile:
        logger.info(f"[zsxq] 获取星球信息: group_id={group_id}")
        resp = await self._request_with_retry("GET", f"/groups/{group_id}")
        data = resp.json().get("resp_data", {}).get("group", {})
        owner = data.get("owner", {})
        name = owner.get("name", data.get("name", ""))
        logger.info(f"[zsxq] 星球: {name}, 成员数: {data.get('member_count', '?')}")
        return CrawledKOLProfile(
            name=name,
            platform_id=group_id,
            avatar_url=owner.get("avatar_url"),
            bio=data.get("introduction"),
            follower_count=data.get("member_count"),
        )

    async def crawl_topics(
        self, group_id: str, since: datetime | None = None, limit: int = 10000
    ) -> tuple[list[CrawledTopic], list[CrawledComment]]:
        """爬取主题，同时提取内嵌评论。返回 (topics, embedded_comments)"""
        logger.info(f"[zsxq] 开始爬取主题: group_id={group_id}, limit={limit}, since={since}")
        topics: list[CrawledTopic] = []
        embedded_comments: list[CrawledComment] = []
        end_time: str | None = None
        page_num = 0
        consecutive_empty = 0

        while len(topics) < limit:
            page_num += 1
            params: dict = {"scope": "all", "count": 20}
            if end_time:
                params["end_time"] = end_time

            try:
                resp = await self._request_with_retry("GET", f"/groups/{group_id}/topics", params=params)
            except Exception as e:
                logger.error(f"[zsxq] 主题列表第{page_num}页请求失败: {e}")
                break

            items = resp.json().get("resp_data", {}).get("topics", [])
            logger.debug(f"[zsxq] 第{page_num}页返回 {len(items)} 条主题")

            if not items:
                consecutive_empty += 1
                if consecutive_empty >= MAX_EMPTY_PAGES:
                    logger.info(f"[zsxq] 连续{MAX_EMPTY_PAGES}页为空, 判定翻完, 共{len(topics)}条主题")
                    break
                logger.warning(f"[zsxq] 第{page_num}页为空 (连续空页 {consecutive_empty}/{MAX_EMPTY_PAGES}), 等待后重试")
                await asyncio.sleep(RETRY_BACKOFF_BASE)
                continue

            consecutive_empty = 0  # 有数据则重置空页计数

            skipped = 0
            for item in items:
                create_time = item.get("create_time", "")
                pub_dt = _parse_zsxq_time(create_time)
                if since and pub_dt and pub_dt < since:
                    logger.info(f"[zsxq] 到达增量边界({since}), 共爬取{len(topics)}条主题, 跳过{skipped}条旧内容")
                    return topics, embedded_comments

                topic_type = item.get("type", "unknown")
                content, images, title = _extract_topic_content(item)

                if not content and not title:
                    skipped += 1
                    logger.debug(f"[zsxq] 跳过空主题: topic_id={item.get('topic_id')}, type={topic_type}")
                    continue

                topics.append(CrawledTopic(
                    platform_topic_id=str(item["topic_id"]),
                    title=title,
                    content=content,
                    content_type=topic_type,
                    url=f"https://wx.zsxq.com/topic/{item['topic_id']}",
                    like_count=item.get("likes_count", 0),
                    comment_count=item.get("comments_count", item.get("show_comments_count", 0)),
                    published_at=pub_dt,
                    images=images,
                    raw_json=item,
                ))

                # 提取内嵌评论 (show_comments)
                for sc in item.get("show_comments", []):
                    embedded_comments.append(_parse_comment(sc))

                if len(topics) >= limit:
                    break

            end_time = items[-1].get("create_time")
            logger.info(f"[zsxq] 第{page_num}页完成, 累计{len(topics)}条主题, 内嵌评论{len(embedded_comments)}条")
            await self._delay()

        logger.info(f"[zsxq] 主题爬取完成: 共{len(topics)}条, 内嵌评论{len(embedded_comments)}条")
        return topics, embedded_comments

    async def crawl_comments(
        self, topic_id: str, limit: int = 500, **kwargs
    ) -> list[CrawledComment]:
        comments: list[CrawledComment] = []
        page = 0

        while len(comments) < limit:
            try:
                resp = await self._request_with_retry(
                    "GET",
                    f"/topics/{topic_id}/comments",
                    params={"count": 20, "page": page},
                )
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (403, 404):
                    logger.warning(f"[zsxq] 评论不可访问(可能已删除/私密): topic_id={topic_id}, status={e.response.status_code}")
                    break
                logger.error(f"[zsxq] 评论请求失败: topic_id={topic_id}, page={page}, error={e}")
                break
            except Exception as e:
                logger.error(f"[zsxq] 评论请求异常: topic_id={topic_id}, page={page}, error={type(e).__name__}: {e}")
                break

            items = resp.json().get("resp_data", {}).get("comments", [])
            if not items:
                break

            for item in items:
                comments.append(_parse_comment(item))

            page += 1
            await self._delay()

        logger.debug(f"[zsxq] topic_id={topic_id} 评论数: {len(comments)}")
        return comments


def _parse_zsxq_time(time_str: str) -> datetime | None:
    if not time_str:
        return None
    try:
        clean = time_str.split(".")[0]
        return datetime.fromisoformat(clean)
    except (ValueError, IndexError):
        logger.debug(f"[zsxq] 时间解析失败: {time_str}")
        return None


def _extract_images(obj: dict) -> list[dict]:
    """从 talk/answer/article/comment 对象中提取图片列表"""
    raw_images = obj.get("images", [])
    if not raw_images:
        return []
    result = []
    for img in raw_images:
        entry: dict = {"image_id": img.get("image_id"), "type": img.get("type")}
        if "thumbnail" in img:
            entry["thumbnail"] = img["thumbnail"]
        if "large" in img:
            entry["large"] = img["large"]
        result.append(entry)
    return result


def _extract_topic_content(item: dict) -> tuple[str, list[dict], str | None]:
    """从主题 item 中提取 (content, images, title)。按 type 分支处理。"""
    topic_type = item.get("type", "unknown")
    title = item.get("title")
    images: list[dict] = []
    parts: list[str] = []

    if topic_type == "q&a":
        question = item.get("question", {})
        answer = item.get("answer", {})
        q_text = question.get("text", "").strip()
        a_text = answer.get("text", "").strip()
        q_owner = question.get("owner", {}).get("name", "")
        a_owner = answer.get("owner", {}).get("name", "")
        if q_text:
            q_label = f"[提问] {q_owner}:" if q_owner else "[提问]:"
            parts.append(f"{q_label} {q_text}")
        if a_text:
            a_label = f"[回答] {a_owner}:" if a_owner else "[回答]:"
            parts.append(f"{a_label} {a_text}")
        # Q&A 通常没有图片，但也检查一下
        images.extend(_extract_images(question))
        images.extend(_extract_images(answer))
        if not title and q_text:
            title = q_text[:80]

    elif topic_type == "talk":
        talk = item.get("talk", {})
        text = talk.get("text", "").strip()
        if text:
            parts.append(text)
        images.extend(_extract_images(talk))
        if not title:
            title = talk.get("title")

    elif topic_type == "article":
        article = item.get("article", {})
        text = article.get("text", "").strip()
        if text:
            parts.append(text)
        images.extend(_extract_images(article))
        if not title:
            title = article.get("title")

    else:
        # 未知类型: 尝试 talk -> article -> question/answer
        for key in ("talk", "article", "question", "answer"):
            sub = item.get(key, {})
            text = sub.get("text", "").strip()
            if text:
                parts.append(text)
                images.extend(_extract_images(sub))
                break

    content = "\n\n".join(parts)
    return content, images, title


def _parse_comment(item: dict) -> CrawledComment:
    """从 API 评论 item 构建 CrawledComment"""
    return CrawledComment(
        platform_comment_id=str(item["comment_id"]),
        author_name=item.get("owner", item.get("author", {})).get("name"),
        content=item.get("text", ""),
        like_count=item.get("likes_count", 0),
        published_at=_parse_zsxq_time(item.get("create_time", "")),
        images=_extract_images(item),
        raw_json=item,
    )
