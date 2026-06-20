"""知乎爬虫

知乎使用Cookie认证。answers/articles 接口需要 x-zse-96 签名，
pins 接口不需要签名。

x-zse-96 签名算法涉及知乎自定义 SM4 加密，纯 Python 实现暂未成功。
当签名不可用时，自动使用 Playwright 浏览器爬取 answers/articles（浏览器自动处理签名），
pins 使用 httpx 直接调用 API（无需签名）。
"""

import hashlib
import httpx
import asyncio
import random
import re
import logging
from datetime import datetime
from bs4 import BeautifulSoup

from app.crawlers.base import BaseCrawler, CrawledTopic, CrawledComment, CrawledKOLProfile
from app.config import settings

logger = logging.getLogger(__name__)

ZHIHU_API_BASE = "https://www.zhihu.com/api/v4"

ZHIHU_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.zhihu.com/",
    "Accept": "application/json, text/plain, */*",
    "x-zse-93": "101_3_3.0",
}

# 请求间隔 (秒)
REQUEST_DELAY_MIN = 2.0
REQUEST_DELAY_MAX = 5.0

# 重试配置
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 5  # 秒

# 空页容忍: 连续空页达到此次数才判定翻完
MAX_EMPTY_PAGES = 3

# 签名服务器连接超时 (秒)
SIGN_SERVER_TIMEOUT = 5


async def _request_sign_from_server(url_path: str) -> str | None:
    """调用签名服务器计算 x-zse-96。失败返回 None。"""
    server = settings.zhihu_sign_server
    if not server:
        return None
    try:
        async with httpx.AsyncClient(timeout=SIGN_SERVER_TIMEOUT) as client:
            resp = await client.post(f"{server}/sign", json={
                "path": url_path,
                "authorization": "",
                "uuid": "",
                "appVersion": "9.41.0",
            })
            if resp.status_code == 200:
                sig = resp.text.strip().strip('"')
                if sig:
                    return sig
    except Exception as e:
        logger.debug(f"[zhihu] 签名服务器不可用: {e}")
    return None


def _fallback_sign(cookie: str, url_path: str) -> str:
    """占位签名算法（大概率被知乎拒绝）"""
    m = re.search(r'd_c0=([^;]+)', cookie)
    if not m:
        return ""
    d_c0 = m.group(1)
    raw = f"d_c0={d_c0}|{url_path}|101_3_3.0"
    return f"2.0_{hashlib.md5(raw.encode()).hexdigest()}"


async def generate_x_zse_96(cookie: str, url_path: str) -> str:
    """生成 x-zse-96 签名。优先使用签名服务器，失败时回退到占位算法。"""
    sig = await _request_sign_from_server(url_path)
    if sig:
        return sig
    return _fallback_sign(cookie, url_path)


def _extract_images_from_html(html: str) -> list[dict]:
    """从 HTML 内容中提取图片 URL"""
    if not html:
        return []
    images = []
    soup = BeautifulSoup(html, "html.parser")
    for img in soup.find_all("img"):
        src = img.get("data-original") or img.get("data-actualsrc") or img.get("src", "")
        if src and not src.startswith("data:"):
            # 知乎图片通常是 //pic*.zhimg.com/... 格式
            if src.startswith("//"):
                src = "https:" + src
            images.append({"url": src})
    return images


class ZhihuCrawler(BaseCrawler):
    """知乎爬虫"""

    platform = "zhihu"

    def __init__(self, cookie: str | None = None):
        self.cookie = cookie or settings.zhihu_cookie
        self.headers = {**ZHIHU_HEADERS, "Cookie": self.cookie}
        self.client = httpx.AsyncClient(
            base_url=ZHIHU_API_BASE,
            headers=self.headers,
            timeout=30.0,
        )
        self._api_available: bool | None = None  # None = 未测试

    async def close(self):
        await self.client.aclose()
        logger.debug("[zhihu] HTTP客户端已关闭")

    async def _delay(self):
        await asyncio.sleep(random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX))

    async def _request_with_retry(self, method: str, url: str, **kwargs) -> httpx.Response:
        """带重试和日志的HTTP请求"""
        last_exc: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = await self.client.request(method, url, **kwargs)
                if resp.status_code == 429:
                    wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    logger.warning(f"[zhihu] 429 限流, 等待{wait}s后重试 ({attempt}/{MAX_RETRIES}): {url}")
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                if status in (401, 403):
                    logger.error(f"[zhihu] {status} 认证失败, 请检查Cookie是否过期")
                    raise
                if status >= 500 and attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    logger.warning(f"[zhihu] {status} 服务端错误, {wait}s后重试 ({attempt}/{MAX_RETRIES}): {url}")
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                logger.error(f"[zhihu] HTTP {status}: {url}")
                raise
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
                if attempt < MAX_RETRIES:
                    wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    logger.warning(f"[zhihu] {type(e).__name__}, {wait}s后重试 ({attempt}/{MAX_RETRIES}): {url}")
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                logger.error(f"[zhihu] 网络异常, 已重试{MAX_RETRIES}次仍失败: {type(e).__name__}")
                raise
        raise last_exc  # type: ignore[misc]

    async def _signed_get(self, path: str, params: dict | None = None) -> httpx.Response:
        """带签名的 GET 请求"""
        url_path = path
        if params:
            qs = "&".join(f"{k}={v}" for k, v in params.items())
            url_path = f"{path}?{qs}"

        sig = await generate_x_zse_96(self.cookie, url_path)
        extra_headers = {"x-zse-96": sig} if sig else {}
        return await self._request_with_retry("GET", path, params=params, headers=extra_headers)

    async def _unsigned_get(self, path: str, params: dict | None = None) -> httpx.Response:
        """不带签名的 GET 请求 (pins 等不需要签名的接口)"""
        return await self._request_with_retry("GET", path, params=params)

    async def _check_api(self) -> bool:
        """测试 answers API 是否可用（只测一次）"""
        if self._api_available is not None:
            return self._api_available

        try:
            resp = await self._signed_get(
                f"/members/{settings.zhihu_url_token}/answers",
                params={"limit": 1, "offset": 0, "sort_by": "created"},
            )
            self._api_available = resp.status_code == 200
        except Exception:
            self._api_available = False

        if not self._api_available:
            logger.warning("[zhihu] answers API 不可用 (x-zse-96 签名无效)，将只爬取 pins")
        else:
            logger.info("[zhihu] answers API 可用，签名服务器工作正常")
        return self._api_available

    async def crawl_kol_profile(self, url_token: str) -> CrawledKOLProfile:
        resp = await self._unsigned_get(f"/members/{url_token}")
        data = resp.json()
        return CrawledKOLProfile(
            name=data.get("name", ""),
            platform_id=str(data.get("id", "")),
            avatar_url=data.get("avatar_url"),
            bio=data.get("headline") or data.get("description"),
            follower_count=data.get("follower_count"),
        )

    async def crawl_topics(
        self, url_token: str, since: datetime | None = None, limit: int = 10000
    ) -> tuple[list[CrawledTopic], list[CrawledComment]]:
        """爬取主题和内嵌评论。返回 (topics, embedded_comments)

        全部通过 Node.js 数据服务器（Playwright 浏览器）获取，
        因为知乎对 httpx 等非浏览器请求会返回 403（TLS 指纹检测）。
        """
        topics: list[CrawledTopic] = []
        embedded_comments: list[CrawledComment] = []

        for tab in ("answers", "articles", "pins"):
            try:
                items = await self._crawl_tab_via_server(url_token, tab, since, limit)
                topics.extend(items)
                logger.info(f"[zhihu] {tab} 爬取完成: {len(items)} 条")
            except Exception as e:
                logger.warning(f"[zhihu] {tab} 爬取失败: {e}")

        logger.info(f"[zhihu] 爬取总计: {len(topics)} 条主题")
        return topics[:limit], embedded_comments

    async def _crawl_tab_via_server(
        self, url_token: str, tab: str, since: datetime | None = None, limit: int = 10000
    ) -> list[CrawledTopic]:
        """通过 Node.js 数据服务器爬取 answers/articles"""
        import json as _json

        server_url = settings.zhihu_sign_server  # 复用同一配置
        if not server_url:
            logger.info(f"[zhihu] 未配置数据服务器(zhihu_sign_server), 跳过 {tab}")
            return []

        max_pages = min(limit // 20 + 1, 50)

        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                resp = await client.post(
                    f"{server_url}/crawl/{tab}",
                    json={
                        "url_token": url_token,
                        "cookie": self.cookie,
                        "max_pages": max_pages,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning(f"[zhihu] 数据服务器请求失败({tab}): {e}")
            return []

        if "error" in data:
            logger.warning(f"[zhihu] 数据服务器返回错误({tab}): {data['error']}")
            return []

        items = data.get("items", [])
        topics: list[CrawledTopic] = []
        parser = {"answers": _parse_answer_item, "articles": _parse_article_item, "pins": _parse_pin_item}
        parse_fn = parser.get(tab, _parse_answer_item)
        for item in items:
            ct = parse_fn(item)
            if ct:
                if since and ct.published_at and ct.published_at < since:
                    break
                topics.append(ct)

        return topics

    async def _crawl_tab_on_page(
        self, page, url_token: str, tab: str, since: datetime | None = None, limit: int = 10000
    ) -> list[CrawledTopic]:
        """在已有的 Playwright page 上爬取 answers/articles（自动处理签名）

        使用 on('response') 捕获 API 响应，避免 expect_response 超时问题。
        """
        import asyncio as _aio

        topics: list[CrawledTopic] = []
        is_end = False

        # 用 asyncio.Event 等待 API 响应
        resp_event = _aio.Event()
        captured_data: dict = {}

        async def on_resp(response):
            if f'/{tab}' in response.url and '/api/v4/members/' in response.url:
                if response.status == 200:
                    try:
                        d = await response.json()
                        captured_data['data'] = d
                    except Exception:
                        pass
                resp_event.set()

        page.on('response', on_resp)

        logger.info(f"[zhihu] 浏览器加载 {url_token}/{tab} ...")

        # 第一页
        resp_event.clear()
        captured_data.clear()
        try:
            await page.goto(
                f'https://www.zhihu.com/people/{url_token}/{tab}',
                wait_until='commit', timeout=30000,
            )
            await _aio.wait_for(resp_event.wait(), timeout=20)
        except _aio.TimeoutError:
            logger.warning(f"[zhihu] {tab} 第一页超时")
            page.remove_listener('response', on_resp)
            return topics
        except Exception as e:
            logger.warning(f"[zhihu] {tab} 第一页失败: {e}")
            page.remove_listener('response', on_resp)
            return topics

        data = captured_data.get('data', {})
        if 'data' not in data:
            err = data.get('error', 'unknown')
            logger.warning(f"[zhihu] {tab} API 返回错误: {err}")
            page.remove_listener('response', on_resp)
            return topics

        totals = data.get('paging', {}).get('totals', '?')
        is_end = data.get('paging', {}).get('is_end', False)
        logger.info(f"[zhihu] {tab} 第1页: {len(data['data'])} 条 (totals={totals})")

        for item in data['data']:
            ct = _parse_answer_item(item) if tab == "answers" else _parse_article_item(item)
            if ct:
                if since and ct.published_at and ct.published_at < since:
                    is_end = True
                    break
                topics.append(ct)

        # 后续页: 滚动加载
        page_num = 1
        while not is_end and len(topics) < limit:
            resp_event.clear()
            captured_data.clear()

            # 滚动到底部
            for _ in range(5):
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                await _aio.sleep(0.8)

            # 等待新 API 响应
            try:
                await _aio.wait_for(resp_event.wait(), timeout=10)
            except _aio.TimeoutError:
                logger.info(f"[zhihu] {tab} 第{page_num+1}页超时，停止翻页")
                break

            data = captured_data.get('data', {})
            if 'data' not in data:
                break

            is_end = data.get('paging', {}).get('is_end', False)
            page_num += 1
            logger.info(f"[zhihu] {tab} 第{page_num}页: +{len(data['data'])} 条 (total={len(topics)})")

            for item in data['data']:
                ct = _parse_answer_item(item) if tab == "answers" else _parse_article_item(item)
                if ct:
                    if since and ct.published_at and ct.published_at < since:
                        is_end = True
                        break
                    topics.append(ct)

        page.remove_listener('response', on_resp)
        logger.info(f"[zhihu] {tab} 浏览器爬取完成: {len(topics)} 条")
        return topics

    async def _fetch_answer_content(self, answer_id: str) -> tuple[str, list[dict]]:
        """获取 answer 完整内容，返回 (text, images)"""
        try:
            resp = await self._signed_get(f"/answers/{answer_id}", params={"include": "content"})
            data = resp.json()
            html_content = data.get("content", "")
            images = _extract_images_from_html(html_content)
            text = _strip_html(html_content) if html_content else data.get("excerpt", "")
            return text, images
        except Exception:
            return "", []

    async def _fetch_article_content(self, article_id: str) -> tuple[str, list[dict]]:
        """获取 article 完整内容，返回 (text, images)"""
        try:
            resp = await self._signed_get(f"/articles/{article_id}")
            data = resp.json()
            html_content = data.get("content", "")
            images = _extract_images_from_html(html_content)
            text = _strip_html(html_content) if html_content else data.get("excerpt", "")
            return text, images
        except Exception:
            return "", []

    async def _crawl_answers(
        self, url_token: str, since: datetime | None, limit: int = 10000
    ) -> list[CrawledTopic]:
        """爬取用户的所有回答，支持全量分页"""
        topics: list[CrawledTopic] = []
        offset = 0
        consecutive_empty = 0
        page_num = 0

        while len(topics) < limit:
            page_num += 1
            resp = await self._signed_get(
                f"/members/{url_token}/answers",
                params={"limit": 20, "offset": offset, "sort_by": "created"},
            )
            data = resp.json()
            items = data.get("data", [])
            logger.debug(f"[zhihu] answers 第{page_num}页返回 {len(items)} 条")

            if not items:
                consecutive_empty += 1
                if consecutive_empty >= MAX_EMPTY_PAGES:
                    logger.info(f"[zhihu] answers 连续{MAX_EMPTY_PAGES}页为空, 判定翻完, 共{len(topics)}条")
                    break
                logger.warning(f"[zhihu] answers 第{page_num}页为空 (连续空页 {consecutive_empty}/{MAX_EMPTY_PAGES})")
                await asyncio.sleep(RETRY_BACKOFF_BASE)
                continue

            consecutive_empty = 0

            for item in items:
                pub_dt = _timestamp_to_datetime(item.get("created_time"))
                if since and pub_dt and pub_dt < since:
                    logger.info(f"[zhihu] answers 到达增量边界({since}), 共{len(topics)}条")
                    return topics

                question = item.get("question", {})
                answer_id = str(item["id"])

                full_content, content_images = await self._fetch_answer_content(answer_id)
                await self._delay()

                topics.append(CrawledTopic(
                    platform_topic_id=answer_id,
                    title=question.get("title"),
                    content=full_content or item.get("excerpt", ""),
                    content_type="answer",
                    url=f"https://www.zhihu.com/question/{question.get('id')}/answer/{item['id']}",
                    like_count=item.get("voteup_count", 0),
                    comment_count=item.get("comment_count", 0),
                    published_at=pub_dt,
                    images=content_images,
                    raw_json=item,
                ))

                if len(topics) >= limit:
                    break

            if data.get("paging", {}).get("is_end", True):
                logger.info(f"[zhihu] answers 翻页结束(is_end=true), 共{len(topics)}条")
                break

            offset += len(items)
            await self._delay()

        return topics

    async def _crawl_articles(
        self, url_token: str, since: datetime | None, limit: int = 10000
    ) -> list[CrawledTopic]:
        """爬取用户的所有文章，支持全量分页"""
        topics: list[CrawledTopic] = []
        offset = 0
        consecutive_empty = 0
        page_num = 0

        while len(topics) < limit:
            page_num += 1
            resp = await self._signed_get(
                f"/members/{url_token}/articles",
                params={"limit": 20, "offset": offset, "sort_by": "created"},
            )
            data = resp.json()
            items = data.get("data", [])
            logger.debug(f"[zhihu] articles 第{page_num}页返回 {len(items)} 条")

            if not items:
                consecutive_empty += 1
                if consecutive_empty >= MAX_EMPTY_PAGES:
                    logger.info(f"[zhihu] articles 连续{MAX_EMPTY_PAGES}页为空, 判定翻完, 共{len(topics)}条")
                    break
                logger.warning(f"[zhihu] articles 第{page_num}页为空 (连续空页 {consecutive_empty}/{MAX_EMPTY_PAGES})")
                await asyncio.sleep(RETRY_BACKOFF_BASE)
                continue

            consecutive_empty = 0

            for item in items:
                pub_dt = _timestamp_to_datetime(item.get("created"))
                if since and pub_dt and pub_dt < since:
                    logger.info(f"[zhihu] articles 到达增量边界({since}), 共{len(topics)}条")
                    return topics

                article_id = str(item["id"])
                full_content, content_images = await self._fetch_article_content(article_id)
                await self._delay()

                topics.append(CrawledTopic(
                    platform_topic_id=article_id,
                    title=item.get("title"),
                    content=full_content or item.get("excerpt", ""),
                    content_type="article",
                    url=item.get("url"),
                    like_count=item.get("voteup_count", 0),
                    comment_count=item.get("comment_count", 0),
                    published_at=pub_dt,
                    images=content_images,
                    raw_json=item,
                ))

                if len(topics) >= limit:
                    break

            if data.get("paging", {}).get("is_end", True):
                logger.info(f"[zhihu] articles 翻页结束(is_end=true), 共{len(topics)}条")
                break

            offset += len(items)
            await self._delay()

        return topics

    async def _crawl_pins(
        self, url_token: str, since: datetime | None, limit: int = 10000
    ) -> list[CrawledTopic]:
        """爬取用户的所有想法(pins)，支持全量分页

        注意: 知乎 pins API 不支持 after_id 游标分页，只支持 offset 偏移分页。
        """
        topics: list[CrawledTopic] = []
        offset = 0
        consecutive_empty = 0
        page_num = 0

        while len(topics) < limit:
            page_num += 1
            params: dict = {"limit": 20, "offset": offset}

            resp = await self._unsigned_get(f"/members/{url_token}/pins", params=params)
            data = resp.json()
            items = data.get("data", [])
            logger.debug(f"[zhihu] pins 第{page_num}页(offset={offset})返回 {len(items)} 条")

            if not items:
                consecutive_empty += 1
                if consecutive_empty >= MAX_EMPTY_PAGES:
                    logger.info(f"[zhihu] pins 连续{MAX_EMPTY_PAGES}页为空, 判定翻完, 共{len(topics)}条")
                    break
                logger.warning(f"[zhihu] pins 第{page_num}页为空 (连续空页 {consecutive_empty}/{MAX_EMPTY_PAGES})")
                await asyncio.sleep(RETRY_BACKOFF_BASE)
                continue

            consecutive_empty = 0

            for item in items:
                pub_dt = _timestamp_to_datetime(item.get("created"))
                if since and pub_dt and pub_dt < since:
                    logger.info(f"[zhihu] pins 到达增量边界({since}), 共{len(topics)}条")
                    return topics

                content_parts = []
                pin_images = []
                for c in item.get("content", []):
                    if c.get("type") == "text":
                        content_parts.append(c.get("content", ""))
                    elif c.get("type") == "link":
                        content_parts.append(f"[链接]({c.get('url', '')})")
                    elif c.get("type") == "image":
                        img_url = c.get("url", "")
                        if img_url:
                            pin_images.append({"url": img_url})

                topics.append(CrawledTopic(
                    platform_topic_id=str(item["id"]),
                    title=None,
                    content="\n".join(content_parts),
                    content_type="pin",
                    url=f"https://www.zhihu.com/pin/{item['id']}",
                    like_count=item.get("like_count", 0),
                    comment_count=item.get("comment_count", 0),
                    published_at=pub_dt,
                    images=pin_images,
                    raw_json=item,
                ))

                if len(topics) >= limit:
                    break

            if data.get("paging", {}).get("is_end", True):
                logger.info(f"[zhihu] pins 翻页结束(is_end=true), 共{len(topics)}条")
                break

            offset += len(items)
            await self._delay()

        return topics

    async def crawl_comments(
        self, platform_topic_id: str, limit: int = 500, content_type: str = "answer"
    ) -> list[CrawledComment]:
        """爬取评论。根据 content_type 选择不同的 API 端点。

        - answer/article: 需要签名，暂不支持（SM4 签名未实现）
        - pin: /pins/{id}/comments (不需要签名)
        """
        if content_type == "pin":
            return await self._crawl_pin_comments(platform_topic_id, limit)
        else:
            # answers/articles 评论需要签名，暂时跳过
            logger.debug(f"[zhihu] {content_type} 评论需要签名，暂跳过: {platform_topic_id}")
            return []

    async def _crawl_answer_comments(
        self, answer_id: str, limit: int = 500
    ) -> list[CrawledComment]:
        """爬取回答下的评论"""
        comments: list[CrawledComment] = []
        offset = 0

        while len(comments) < limit:
            try:
                resp = await self._signed_get(
                    f"/answers/{answer_id}/comments",
                    params={"limit": 20, "offset": offset},
                )
                data = resp.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (403, 404):
                    logger.warning(f"[zhihu] answer评论不可访问: answer_id={answer_id}")
                    break
                raise
            except Exception as e:
                logger.warning(f"[zhihu] answer评论请求异常: answer_id={answer_id}, error={e}")
                break

            items = data.get("data", [])
            if not items:
                break

            for item in items:
                comments.append(_parse_comment(item))

            offset += len(items)
            if data.get("paging", {}).get("is_end", True):
                break

            await self._delay()

        return comments

    async def _crawl_article_comments(
        self, article_id: str, limit: int = 500
    ) -> list[CrawledComment]:
        """爬取文章下的评论"""
        comments: list[CrawledComment] = []
        offset = 0

        while len(comments) < limit:
            try:
                resp = await self._signed_get(
                    f"/articles/{article_id}/comments",
                    params={"limit": 20, "offset": offset},
                )
                data = resp.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (403, 404):
                    logger.warning(f"[zhihu] article评论不可访问: article_id={article_id}")
                    break
                raise
            except Exception as e:
                logger.warning(f"[zhihu] article评论请求异常: article_id={article_id}, error={e}")
                break

            items = data.get("data", [])
            if not items:
                break

            for item in items:
                comments.append(_parse_comment(item))

            offset += len(items)
            if data.get("paging", {}).get("is_end", True):
                break

            await self._delay()

        return comments

    async def _crawl_pin_comments(
        self, pin_id: str, limit: int = 500
    ) -> list[CrawledComment]:
        """爬取想法下的评论 (不需要签名)"""
        comments: list[CrawledComment] = []
        offset = 0

        while len(comments) < limit:
            try:
                resp = await self._unsigned_get(
                    f"/pins/{pin_id}/comments",
                    params={"limit": 20, "offset": offset},
                )
                data = resp.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (403, 404):
                    logger.warning(f"[zhihu] pin评论不可访问: pin_id={pin_id}")
                    break
                raise
            except Exception as e:
                logger.warning(f"[zhihu] pin评论请求异常: pin_id={pin_id}, error={e}")
                break

            items = data.get("data", [])
            if not items:
                break

            for item in items:
                comments.append(_parse_comment(item))

            offset += len(items)
            if data.get("paging", {}).get("is_end", True):
                break

            await self._delay()

        return comments


def _parse_answer_item(item: dict) -> CrawledTopic | None:
    """从浏览器 API 响应中解析 answer item 为 CrawledTopic"""
    question = item.get("question", {})
    answer_id = str(item.get("id", ""))
    if not answer_id:
        return None

    html_content = item.get("content", "")
    images = _extract_images_from_html(html_content)
    text = _strip_html(html_content) if html_content else item.get("excerpt", "")
    title = question.get("title")

    return CrawledTopic(
        platform_topic_id=answer_id,
        title=title,
        content=text,
        content_type="answer",
        url=f"https://www.zhihu.com/question/{question.get('id')}/answer/{answer_id}",
        like_count=item.get("voteup_count", 0),
        comment_count=item.get("comment_count", 0),
        published_at=_timestamp_to_datetime(item.get("created_time")),
        images=images,
        raw_json=item,
    )


def _parse_article_item(item: dict) -> CrawledTopic | None:
    """从浏览器 API 响应中解析 article item 为 CrawledTopic"""
    article_id = str(item.get("id", ""))
    if not article_id:
        return None

    html_content = item.get("content", "")
    images = _extract_images_from_html(html_content)
    text = _strip_html(html_content) if html_content else item.get("excerpt", "")

    return CrawledTopic(
        platform_topic_id=article_id,
        title=item.get("title"),
        content=text,
        content_type="article",
        url=item.get("url"),
        like_count=item.get("voteup_count", 0),
        comment_count=item.get("comment_count", 0),
        published_at=_timestamp_to_datetime(item.get("created")),
        images=images,
        raw_json=item,
    )


def _parse_pin_item(item: dict) -> CrawledTopic | None:
    """从浏览器 API 响应中解析 pin item 为 CrawledTopic"""
    pin_id = str(item.get("id", ""))
    if not pin_id:
        return None

    content_parts = []
    pin_images = []
    for c in item.get("content", []):
        if c.get("type") == "text":
            content_parts.append(c.get("content", ""))
        elif c.get("type") == "link":
            content_parts.append(f"[链接]({c.get('url', '')})")
        elif c.get("type") == "image":
            img_url = c.get("url", "")
            if img_url:
                pin_images.append({"url": img_url})

    return CrawledTopic(
        platform_topic_id=pin_id,
        title=None,
        content="\n".join(content_parts),
        content_type="pin",
        url=f"https://www.zhihu.com/pin/{pin_id}",
        like_count=item.get("like_count", 0),
        comment_count=item.get("comment_count", 0),
        published_at=_timestamp_to_datetime(item.get("created")),
        images=pin_images,
        raw_json=item,
    )


def _parse_comment(item: dict) -> CrawledComment:
    """从 API 评论 item 构建 CrawledComment"""
    author = item.get("author", {})
    content_html = item.get("content", "")
    images = _extract_images_from_html(content_html)
    return CrawledComment(
        platform_comment_id=str(item["id"]),
        author_name=author.get("name"),
        content=_strip_html(content_html) if content_html else "",
        like_count=item.get("vote_count", 0),
        published_at=_timestamp_to_datetime(item.get("created_time")),
        images=images,
        raw_json=item,
    )


def _timestamp_to_datetime(ts: int | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromtimestamp(ts)


def _strip_html(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
