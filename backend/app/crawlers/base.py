from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class CrawledTopic:
    platform_topic_id: str
    title: str | None
    content: str
    content_type: str  # article | answer | pin | topic | q&a
    url: str | None
    like_count: int
    comment_count: int
    published_at: datetime | None
    images: list[dict] = field(default_factory=list)
    is_digest: bool = False
    raw_json: dict | None = None


@dataclass
class CrawledComment:
    platform_comment_id: str
    author_name: str | None
    content: str
    like_count: int
    published_at: datetime | None
    images: list[dict] = field(default_factory=list)
    raw_json: dict | None = None


@dataclass
class CrawledKOLProfile:
    name: str
    platform_id: str
    avatar_url: str | None
    bio: str | None
    follower_count: int | None


class BaseCrawler(ABC):
    """爬虫抽象基类"""

    platform: str

    @abstractmethod
    async def crawl_kol_profile(self, url_token: str) -> CrawledKOLProfile:
        """爬取KOL基本信息"""
        ...

    @abstractmethod
    async def crawl_topics(
        self, url_token: str, since: datetime | None = None, limit: int = 10000
    ) -> list[CrawledTopic]:
        """爬取KOL的主题/文章/回答列表"""
        ...

    @abstractmethod
    async def crawl_comments(
        self, platform_topic_id: str, limit: int = 500, **kwargs
    ) -> list[CrawledComment]:
        """爬取某个主题下的评论。kwargs 可包含 content_type 等平台特定参数。"""
        ...
