from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, JSON, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Topic(Base):
    """文章 / 动态 / 回答"""
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    platform_topic_id: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str | None] = mapped_column(String(512))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)  # article|answer|pin|topic|q&a
    url: Mapped[str | None] = mapped_column(String(1024))
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    images: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    crawled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime)

    comments: Mapped[list["Comment"]] = relationship(back_populates="topic", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("platform", "platform_topic_id", name="uq_topic_platform"),)


class Comment(Base):
    """评论 / 回复"""
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic_id: Mapped[int] = mapped_column(Integer, ForeignKey("topics.id"), nullable=False)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    platform_comment_id: Mapped[str] = mapped_column(String(128), nullable=False)
    author_name: Mapped[str | None] = mapped_column(String(128))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    images: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    crawled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    topic: Mapped["Topic"] = relationship(back_populates="comments")

    __table_args__ = (UniqueConstraint("platform", "platform_comment_id", name="uq_comment_platform"),)


class CrawlTask(Base):
    """爬取任务记录"""
    __tablename__ = "crawl_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)  # pending|running|done|error
    topics_count: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)


class SemanticChunk(Base):
    """语义chunk - 记录已入库ChromaDB的文本块"""
    __tablename__ = "semantic_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)  # topic | comment
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    chroma_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    embedded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class PublicVisitor(Base):
    """公共首页访客"""
    __tablename__ = "public_visitors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visitor_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class PublicMessage(Base):
    """公共首页访客聊天消息"""
    __tablename__ = "public_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visitor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        # 保证按 visitor 查询时按 id 排序
        {"sqlite_autoincrement": True},
    )


class RecommendedHolding(Base):
    """大V推荐持仓 — AI 定期生成"""
    __tablename__ = "recommended_holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stock_name: Mapped[str] = mapped_column(String(64), nullable=False)
    stock_code: Mapped[str | None] = mapped_column(String(32))
    sentiment: Mapped[str] = mapped_column(String(16), nullable=False)  # bullish|bearish|neutral
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    source_topic_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    source_kols: Mapped[list | None] = mapped_column(JSON, nullable=True)
    confidence: Mapped[float] = mapped_column(default=0.5)
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
