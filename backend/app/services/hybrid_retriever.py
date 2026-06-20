"""混合检索: BM25 稀疏检索 + Dense 向量检索 + RRF 融合排序"""

import logging
import re
from rank_bm25 import BM25Okapi

from app.services.vectorstore import get_all_documents

logger = logging.getLogger(__name__)

# BM25 索引（内存，启动时构建）
_bm25_index: BM25Okapi | None = None
_bm25_ids: list[str] = []
_bm25_docs: list[str] = []
_bm25_metadatas: list[dict] = []


def _tokenize(text: str) -> list[str]:
    """中英文混合分词：英文单词 + 中文 n-gram (1-3) + 数字"""
    # 英文单词（保留完整词）
    words = re.findall(r'[a-zA-Z]+', text.lower())
    # 中文字符
    chinese_chars = re.findall(r'[一-鿿]', text)
    # 中文 bigram + trigram（提升多字词匹配）
    ngrams = list(chinese_chars)
    for i in range(len(chinese_chars) - 1):
        ngrams.append(chinese_chars[i] + chinese_chars[i + 1])
    for i in range(len(chinese_chars) - 2):
        ngrams.append(chinese_chars[i] + chinese_chars[i + 1] + chinese_chars[i + 2])
    # 数字
    numbers = re.findall(r'\d+', text)
    return words + ngrams + numbers


def build_bm25_index():
    """从 ChromaDB 加载所有文档，构建 BM25 索引"""
    global _bm25_index, _bm25_ids, _bm25_docs, _bm25_metadatas

    logger.info("构建 BM25 索引...")
    data = get_all_documents()
    _bm25_ids = data["ids"]
    _bm25_docs = data["documents"]
    _bm25_metadatas = data["metadatas"]

    if not _bm25_docs:
        logger.warning("BM25 索引为空：ChromaDB 中无文档")
        return

    tokenized = [_tokenize(doc) for doc in _bm25_docs]
    _bm25_index = BM25Okapi(tokenized)
    logger.info(f"BM25 索引构建完成: {len(_bm25_docs)} 个文档")


def bm25_search(query: str, top_k: int = 20) -> list[dict]:
    """BM25 稀疏检索，返回 [{id, document, metadata, score}]"""
    if _bm25_index is None or not _bm25_docs:
        return []

    query_tokens = _tokenize(query)
    scores = _bm25_index.get_scores(query_tokens)

    # 取 top_k 个最高分
    ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:top_k]

    results = []
    for idx, score in ranked:
        if score <= 0:
            continue
        results.append({
            "id": _bm25_ids[idx],
            "document": _bm25_docs[idx],
            "metadata": _bm25_metadatas[idx],
            "score": float(score),
        })
    return results


def reciprocal_rank_fusion(
    dense_results: list[dict],
    bm25_results: list[dict],
    k: int = 30,
    top_k: int = 8,
    dense_weight: float = 1.5,
    bm25_weight: float = 1.0,
) -> list[dict]:
    """加权 Reciprocal Rank Fusion (RRF) 融合排序

    Args:
        dense_results: 向量检索结果 [{id, document, metadata}]
        bm25_results: BM25 检索结果 [{id, document, metadata, score}]
        k: RRF 参数（越小排名差异越大，默认 30）
        top_k: 返回的结果数量
        dense_weight: Dense 检索权重（默认 1.5，语义检索更重要）
        bm25_weight: BM25 检索权重（默认 1.0）
        top_k: 返回的结果数量

    Returns:
        融合排序后的结果 [{id, document, metadata, rrf_score}]
    """
    # 计算每个文档的 RRF 分数
    rrf_scores: dict[str, float] = {}
    doc_map: dict[str, dict] = {}

    # Dense 排名（加权）
    for rank, item in enumerate(dense_results):
        doc_id = item["id"]
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0) + dense_weight / (k + rank + 1)
        doc_map[doc_id] = item

    # BM25 排名（加权）
    for rank, item in enumerate(bm25_results):
        doc_id = item["id"]
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0) + bm25_weight / (k + rank + 1)
        if doc_id not in doc_map:
            doc_map[doc_id] = item

    # 按 RRF 分数排序
    sorted_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)[:top_k]

    results = []
    for doc_id in sorted_ids:
        item = doc_map[doc_id]
        item["rrf_score"] = rrf_scores[doc_id]
        results.append(item)

    return results


def add_to_bm25_index(ids: list[str], documents: list[str], metadatas: list[dict]):
    """增量添加文档到 BM25 索引（embedding 新内容时调用）"""
    global _bm25_index, _bm25_ids, _bm25_docs, _bm25_metadatas

    _bm25_ids.extend(ids)
    _bm25_docs.extend(documents)
    _bm25_metadatas.extend(metadatas)

    # 重建索引（BM25Okapi 不支持增量更新）
    if _bm25_docs:
        tokenized = [_tokenize(doc) for doc in _bm25_docs]
        _bm25_index = BM25Okapi(tokenized)
