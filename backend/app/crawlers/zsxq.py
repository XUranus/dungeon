"""知识星球爬虫

参考: https://github.com/yiancode/zsxq-sdk
知识星球使用Cookie认证, 没有公开API。
主要接口:
  - GET /api/v2/groups/{group_id}/topics
  - GET /api/v2/topics/{topic_id}/comments
"""

import httpx
import asyncio
import hashlib
import uuid
import random
import re
import time
import logging
from datetime import datetime
from urllib.parse import unquote

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

# 空 body 的 MD5（GET 请求签名用）
_EMPTY_BODY_MD5 = hashlib.md5(b"").hexdigest()


def _generate_zsxq_sign(full_url: str, timestamp: str, request_id: str) -> str:
    """生成 X-Signature: SHA1(full_url + " " + timestamp + " " + requestId)
    full_url 必须包含完整域名，如 https://api.zsxq.com/v2/groups/xxx/topics
    """
    message = f"{full_url} {timestamp} {request_id}"
    return hashlib.sha1(message.encode()).hexdigest()


def _generate_zsxq_request_headers(full_url: str, body: str = "") -> dict:
    """为 zsxq API 请求生成签名 headers
    full_url: 完整 URL（含 https://api.zsxq.com 前缀）
    """
    ts = str(int(time.time()))
    req_id = str(uuid.uuid4())
    return {
        "X-Request-Id": req_id,
        "X-Version": "2.94.0",
        "X-Timestamp": ts,
        "X-Signature": _generate_zsxq_sign(full_url, ts, req_id),
        "X-Aduid": str(uuid.uuid4()),
    }


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
                # 注入签名 headers（签名需要完整 URL）
                body = kwargs.get("content", b"")
                if isinstance(body, bytes):
                    body = body.decode("utf-8", errors="ignore")
                full_url = f"{ZSXQ_API_BASE}{url}" if not url.startswith("http") else url
                sign_headers = _generate_zsxq_request_headers(full_url, body)
                existing_headers = kwargs.get("headers", {})
                kwargs["headers"] = {**existing_headers, **sign_headers}
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
                    from app.services.notify import notify, mark_cookie_expired
                    mark_cookie_expired("zsxq")
                    notify(
                        "⚠️ 知识星球 Cookie 过期",
                        f"认证失败 ({status})，请在后台设置页面更新知识星球 Cookie",
                    )
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
        from app.services.notify import is_cookie_expired
        if is_cookie_expired("zsxq"):
            logger.warning("[zsxq] Cookie 已标记失效，跳过星球信息获取")
            return CrawledKOLProfile(name="", platform_id=group_id)
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

    async def fetch_digest_ids(self, group_id: str, count: int = 100) -> set[str]:
        """获取精华文章的 topic_id 集合"""
        from app.services.notify import is_cookie_expired
        if is_cookie_expired("zsxq"):
            logger.warning("[zsxq] Cookie 已标记失效，跳过精华列表获取")
            return set()
        digest_ids: set[str] = set()
        index = 0
        while index < count:
            try:
                resp = await self._request_with_retry(
                    "GET",
                    f"/groups/{group_id}/topics/digests",
                    params={
                        "sort": "by_create_time",
                        "direction": "desc",
                        "index": index,
                        "count": min(30, count - index),
                    },
                )
                items = resp.json().get("resp_data", {}).get("topics", [])
                if not items:
                    break
                for item in items:
                    tid = str(item.get("topic_id", ""))
                    if tid:
                        digest_ids.add(tid)
                index += len(items)
                logger.debug(f"[zsxq] 精华列表: 累计{len(digest_ids)}条")
                await self._delay()
            except Exception as e:
                logger.error(f"[zsxq] 获取精华列表失败(index={index}): {e}")
                break
        logger.info(f"[zsxq] 精华文章获取完成: 共{len(digest_ids)}条")
        return digest_ids

    async def crawl_topics(
        self, group_id: str, since: datetime | None = None, limit: int = 10000,
        digest_ids: set[str] | None = None,
    ) -> tuple[list[CrawledTopic], list[CrawledComment]]:
        """爬取主题，同时提取内嵌评论。返回 (topics, embedded_comments)"""
        from app.services.notify import is_cookie_expired
        if is_cookie_expired("zsxq"):
            logger.warning("[zsxq] Cookie 已标记失效，跳过爬取。请更新 Cookie 后重试。")
            return [], []
        logger.info(f"[zsxq] 开始爬取主题: group_id={group_id}, limit={limit}, since={since}")
        topics: list[CrawledTopic] = []
        embedded_comments: list[CrawledComment] = []
        _digest_ids = digest_ids or set()
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
                content, images, title, article_id = _extract_topic_content(item)

                if not content and not title:
                    skipped += 1
                    logger.debug(f"[zsxq] 跳过空主题: topic_id={item.get('topic_id')}, type={topic_type}")
                    continue

                # talk 中嵌套了文章引用 → 获取完整文章内容（保持 talk 类型，避免污染专栏文章增量边界）
                topic_url = f"https://wx.zsxq.com/topic/{item['topic_id']}"
                if article_id:
                    html_content, html_images = await self._fetch_article_html(article_id)
                    if html_content:
                        content = html_content
                    if html_images:
                        images = [{"url": url} for url in html_images]
                    topic_url = f"https://articles.zsxq.com/id_{article_id}.html"
                    logger.debug(f"[zsxq] 从 talk 中提取嵌套文章: article_id={article_id}")

                topics.append(CrawledTopic(
                    platform_topic_id=str(item["topic_id"]),
                    title=title,
                    content=content,
                    content_type=topic_type,
                    url=topic_url,
                    like_count=item.get("likes_count", 0),
                    comment_count=item.get("comments_count", item.get("show_comments_count", 0)),
                    published_at=pub_dt,
                    images=images,
                    is_digest=str(item["topic_id"]) in _digest_ids,
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
        from app.services.notify import is_cookie_expired
        if is_cookie_expired("zsxq"):
            logger.warning("[zsxq] Cookie 已标记失效，跳过评论抓取")
            return []
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

    # ── 专栏文章 ──

    async def crawl_columns(self, group_id: str) -> list[dict]:
        """获取星球的专栏列表，返回 [{column_id, name, topics_count}]"""
        from app.services.notify import is_cookie_expired
        if is_cookie_expired("zsxq"):
            logger.warning("[zsxq] Cookie 已标记失效，跳过专栏列表获取")
            return []
        try:
            resp = await self._request_with_retry("GET", f"/groups/{group_id}/columns")
            columns = resp.json().get("resp_data", {}).get("columns", [])
            result = []
            for col in columns:
                result.append({
                    "column_id": col["column_id"],
                    "name": col.get("name", ""),
                    "topics_count": col.get("statistics", {}).get("topics_count", 0),
                })
            logger.info("[zsxq] 获取专栏列表: %d 个专栏", len(result))
            return result
        except Exception as e:
            logger.error("[zsxq] 获取专栏列表失败: %s", e)
            return []

    async def crawl_column_articles(
        self, group_id: str, column_id: int, limit: int = 1000,
        since: datetime | None = None,
    ) -> list[CrawledTopic]:
        """抓取专栏下的文章（支持分页 + 增量），返回 CrawledTopic 列表"""
        from app.services.notify import is_cookie_expired
        if is_cookie_expired("zsxq"):
            logger.warning("[zsxq] Cookie 已标记失效，跳过专栏文章抓取")
            return []
        logger.info("[zsxq] 开始抓取专栏文章: column_id=%d, limit=%d, since=%s", column_id, limit, since)

        # Step 1: 分页列出专栏中的文章
        all_items: list[dict] = []
        end_time: str | None = None
        page_num = 0
        consecutive_empty = 0

        while len(all_items) < limit:
            page_num += 1
            params: dict = {"count": min(limit - len(all_items), 100)}
            if end_time:
                params["end_time"] = end_time

            try:
                resp = await self._request_with_retry(
                    "GET",
                    f"/groups/{group_id}/columns/{column_id}/topics",
                    params=params,
                )
                items = resp.json().get("resp_data", {}).get("topics", [])
            except Exception as e:
                logger.error("[zsxq] 专栏文章列表第%d页请求失败: column_id=%d, %s", page_num, column_id, e)
                break

            if not items:
                consecutive_empty += 1
                if consecutive_empty >= MAX_EMPTY_PAGES:
                    logger.info("[zsxq] 专栏 column_id=%d 连续%d页为空, 判定翻完, 共%d篇",
                                column_id, MAX_EMPTY_PAGES, len(all_items))
                    break
                logger.warning("[zsxq] 专栏 column_id=%d 第%d页为空 (连续空页 %d/%d), 等待后重试",
                               column_id, page_num, consecutive_empty, MAX_EMPTY_PAGES)
                await asyncio.sleep(RETRY_BACKOFF_BASE)
                continue

            consecutive_empty = 0

            # 增量检查：遇到早于 since 的文章就停止
            reached_since = False
            for item in items:
                create_time = item.get("create_time", "")
                pub_dt = _parse_zsxq_time(create_time)
                if since and pub_dt and pub_dt < since:
                    logger.info("[zsxq] 专栏 column_id=%d 到达增量边界(%s), 已收集%d篇",
                                column_id, since, len(all_items))
                    reached_since = True
                    break
                all_items.append(item)

            end_time = items[-1].get("create_time")
            logger.info("[zsxq] 专栏 column_id=%d 第%d页完成, 累计%d篇", column_id, page_num, len(all_items))

            if reached_since:
                break
            await self._delay()

        if not all_items:
            logger.info("[zsxq] 专栏 column_id=%d 无文章", column_id)
            return []

        # Step 2: 对每篇文章获取详情 + HTML 内容
        articles: list[CrawledTopic] = []
        for item in all_items:
            topic_id = item.get("topic_id")
            if not topic_id:
                continue
            try:
                article = await self._fetch_article_detail(topic_id, item)
                if article:
                    articles.append(article)
                await self._delay()
            except Exception as e:
                logger.warning("[zsxq] 文章获取失败: topic_id=%s, %s", topic_id, e)

        logger.info("[zsxq] 专栏 column_id=%d 文章抓取完成: %d/%d 篇", column_id, len(articles), len(all_items))
        return articles

    async def _fetch_article_detail(
        self, topic_id: int, summary: dict
    ) -> CrawledTopic | None:
        """获取单篇文章的完整内容（通过 topic API + HTML 页面）"""
        # 获取 topic 详情以拿到 article_id
        try:
            resp = await self._request_with_retry("GET", f"/topics/{topic_id}")
            topic_data = resp.json().get("resp_data", {}).get("topic", {})
        except Exception as e:
            logger.warning("[zsxq] topic 详情获取失败: topic_id=%s, %s", topic_id, e)
            return None

        # 从 talk.article 或 article 中提取 article_id
        article_info = {}
        talk = topic_data.get("talk", {})
        if "article" in talk and isinstance(talk["article"], dict):
            article_info = talk["article"]
        elif "article" in topic_data and isinstance(topic_data["article"], dict):
            article_info = topic_data["article"]

        article_id = article_info.get("article_id")
        article_url = article_info.get("article_url", "")

        # 提取文本和图片
        content_text, images, _, _ = _extract_topic_content(topic_data)

        # 如果有 article_id，从 HTML 获取更完整的内容（含图片）
        if article_id:
            html_content, html_images = await self._fetch_article_html(article_id)
            if html_content:
                content_text = html_content
            if html_images:
                images = [{"url": url} for url in html_images]

        if not content_text and not summary.get("title"):
            return None

        title = summary.get("title") or topic_data.get("title") or ""
        pub_dt = _parse_zsxq_time(summary.get("create_time", ""))

        return CrawledTopic(
            platform_topic_id=str(topic_id),
            title=title,
            content=content_text,
            content_type="article",
            url=article_url or f"https://wx.zsxq.com/topic/{topic_id}",
            like_count=topic_data.get("likes_count", 0),
            comment_count=topic_data.get("comments_count", 0),
            published_at=pub_dt,
            images=images,
            raw_json=topic_data,
        )

    async def _fetch_article_html(self, article_id: str) -> tuple[str, list[str]]:
        """从 articles.zsxq.com 获取文章 HTML，提取纯文本和图片 URL"""
        url = f"https://articles.zsxq.com/id_{article_id}.html"
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                resp = await client.get(url, headers={"Cookie": self.cookie})
                if resp.status_code != 200:
                    logger.warning("[zsxq] 文章 HTML 获取失败: %s -> %d", url, resp.status_code)
                    return "", []
                html = resp.text
        except Exception as e:
            logger.warning("[zsxq] 文章 HTML 请求异常: %s, %s", url, e)
            return "", []

        import re
        # 提取 ql-editor 中的内容
        start = html.find('class="content ql-editor"')
        if start < 0:
            return "", []
        start = html.find(">", start) + 1
        end = html.find("</div>", start)
        if end < 0:
            return "", []
        content_html = html[start:end]

        # 提取图片 URL
        image_urls = list(dict.fromkeys(
            re.findall(r'(https://article-images\.zsxq\.com/\S+?)(?=["\s<])', content_html)
        ))

        # 先转换 zsxq 自定义标签，再提取纯文本
        content_html = zsxq_xml_to_html(content_html)
        text = re.sub(r'<br\s*/?>', '\n', content_html)
        text = re.sub(r'<img[^>]*>', '', text)  # 移除 img 标签
        text = re.sub(r'<[^>]+>', '', text)      # 移除所有 HTML 标签
        text = re.sub(r'\n{3,}', '\n\n', text).strip()
        # 解码 HTML 实体
        text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')

        return text, image_urls


def zsxq_xml_to_html(text: str) -> str:
    """将知识星球自定义 XML 标签转换为标准 HTML。

    已知标签类型:
      <e type="text_bold" title="URL编码文本" />
        → <strong>解码文本</strong>

      <e type="web" href="URL编码链接" title="URL编码标题" />
        → <a href="解码链接">解码标题</a>

      <e type="mention" uid="..." title="@用户名" />
        → <strong>@用户名</strong>

      <e type="hashtag" hid="..." title="#话题#" />
        → <strong>#话题#</strong>

    同时处理 <e> 的非自闭合写法: <e type="text_bold">文本</e> → <strong>文本</strong>
    """
    if not text or "<e " not in text:
        return text

    # 1) 非自闭合: <e type="...">innerText</e>
    def _replace_open_close(m: re.Match) -> str:
        attrs = m.group(1)
        inner = m.group(2).strip()
        tag_type = _attr(attrs, "type")
        if tag_type == "text_bold":
            return f"<strong>{inner}</strong>"
        if tag_type == "web":
            href = _attr(attrs, "href")
            return f'<a href="{unquote(href)}">{inner}</a>' if href else inner
        if tag_type == "mention":
            return f"<strong>{inner}</strong>"
        if tag_type == "hashtag":
            return f"<strong>{inner}</strong>"
        return inner

    text = re.sub(
        r'<e\s+([^>]*)>(.+?)</e>',
        _replace_open_close,
        text,
        flags=re.DOTALL,
    )

    # 2) 自闭合: <e type="..." ... />
    def _replace_self_closing(m: re.Match) -> str:
        attrs = m.group(1)
        tag_type = _attr(attrs, "type")
        if tag_type == "text_bold":
            title = _attr(attrs, "title")
            return f"<strong>{unquote(title)}</strong>" if title else ""
        if tag_type == "web":
            href = _attr(attrs, "href")
            title = _attr(attrs, "title")
            decoded_href = unquote(href) if href else ""
            decoded_title = unquote(title) if title else decoded_href
            if decoded_href:
                return f'<a href="{decoded_href}">{decoded_title}</a>'
            return decoded_title
        if tag_type == "mention":
            title = _attr(attrs, "title")
            return f"<strong>{title}</strong>" if title else ""
        if tag_type == "hashtag":
            title = _attr(attrs, "title")
            return f"<strong>{unquote(title)}</strong>" if title else ""
        return ""

    text = re.sub(r'<e\s+([^>]*)\s*/>', _replace_self_closing, text)

    return text


def _attr(attrs_str: str, name: str) -> str | None:
    """从属性字符串中提取指定属性值"""
    m = re.search(rf'{name}="([^"]*)"', attrs_str)
    return m.group(1) if m else None


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


def _extract_topic_content(item: dict) -> tuple[str, list[dict], str | None, str | None]:
    """从主题 item 中提取 (content, images, title, article_id)。按 type 分支处理。
    article_id: 如果 talk 中嵌套了文章引用，返回 article_id 供调用方获取完整文章内容。"""
    topic_type = item.get("type", "unknown")
    title = item.get("title")
    images: list[dict] = []
    parts: list[str] = []
    article_id: str | None = None

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
        # talk 中可能嵌套文章引用（非专栏文章）
        talk_article = talk.get("article", {})
        if isinstance(talk_article, dict) and talk_article.get("article_id"):
            article_id = talk_article["article_id"]
            if not title:
                title = talk_article.get("title")

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
    # 将 zsxq 自定义 XML 标签转换为标准 HTML
    content = zsxq_xml_to_html(content)
    return content, images, title, article_id


def _parse_comment(item: dict) -> CrawledComment:
    """从 API 评论 item 构建 CrawledComment"""
    return CrawledComment(
        platform_comment_id=str(item["comment_id"]),
        author_name=item.get("owner", item.get("author", {})).get("name"),
        content=zsxq_xml_to_html(item.get("text", "")),
        like_count=item.get("likes_count", 0),
        published_at=_parse_zsxq_time(item.get("create_time", "")),
        images=_extract_images(item),
        raw_json=item,
    )
