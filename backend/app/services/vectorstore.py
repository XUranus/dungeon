"""ChromaDB向量存储管理"""

import chromadb
from app.config import settings

# ChromaDB 客户端 (持久化)
_chroma_client: chromadb.ClientAPI | None = None
_collection: chromadb.Collection | None = None

COLLECTION_NAME = "kol_opinions"


def get_chroma_client() -> chromadb.ClientAPI:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    return _chroma_client


def get_collection() -> chromadb.Collection:
    global _collection
    if _collection is None:
        client = get_chroma_client()
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def add_documents(
    ids: list[str],
    documents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict] | None = None,
):
    """向ChromaDB添加文档"""
    collection = get_collection()
    collection.add(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
    )


def query(
    query_embedding: list[float],
    n_results: int = 10,
    where: dict | None = None,
) -> dict:
    """向量检索"""
    collection = get_collection()
    kwargs: dict = {
        "query_embeddings": [query_embedding],
        "n_results": n_results,
    }
    if where:
        kwargs["where"] = where
    return collection.query(**kwargs)


def delete_by_source(source_type: str, source_id: int):
    """删除指定来源的所有chunk"""
    collection = get_collection()
    collection.delete(where={"source_type": source_type, "source_id": source_id})


def get_all_documents() -> dict:
    """获取所有文档（用于 BM25 索引构建）。返回 {ids, documents, metadatas}"""
    collection = get_collection()
    result = collection.get(include=["documents", "metadatas"])
    return {
        "ids": result["ids"],
        "documents": result["documents"] or [],
        "metadatas": result["metadatas"] or [],
    }
