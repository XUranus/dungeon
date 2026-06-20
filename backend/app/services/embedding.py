"""Embedding服务 - 支持 OpenAI API 和本地 BGE-Small-ZH-v1.5"""

import logging
import os
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

# ---- 本地模型预检 ----
LOCAL_MODEL_ID = "BAAI/bge-small-zh-v1.5"
_local_model_path: str | None = None  # 缓存snapshot_download返回的本地路径


def ensure_local_model() -> bool:
    """检查本地embedding模型是否存在，不存在则下载。返回是否可用。"""
    global _local_model_path
    from huggingface_hub import snapshot_download

    # 设置HF镜像（国内网络优化）
    if settings.hf_mirror_url:
        os.environ["HF_ENDPOINT"] = settings.hf_mirror_url
        logger.info(f"HuggingFace 镜像: {settings.hf_mirror_url}")

    # SSL问题时跳过证书验证
    os.environ.setdefault("CURL_CA_BUNDLE", "")
    os.environ.setdefault("REQUESTS_CA_BUNDLE", "")

    try:
        logger.info(f"检查本地embedding模型 {LOCAL_MODEL_ID} ...")
        _local_model_path = snapshot_download(
            repo_id=LOCAL_MODEL_ID,
            local_files_only=True,  # 只检查本地缓存
        )
        logger.info(f"模型 {LOCAL_MODEL_ID} 已存在于本地缓存: {_local_model_path}")
        return True
    except Exception:
        logger.info(f"模型 {LOCAL_MODEL_ID} 本地不存在，开始下载...")
        try:
            _local_model_path = snapshot_download(
                repo_id=LOCAL_MODEL_ID,
                local_files_only=False,  # 允许从HF下载
            )
            logger.info(f"模型 {LOCAL_MODEL_ID} 下载完成: {_local_model_path}")
            return True
        except Exception as e:
            logger.error(f"模型下载失败: {e}")
            logger.error("解决方案: 手动下载模型到 ~/.cache/huggingface/hub/ 目录")
            logger.error("  pip install huggingface_hub && huggingface-cli download BAAI/bge-small-zh-v1.5")
            return False


# ---- OpenAI ----
_openai_client: AsyncOpenAI | None = None

def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        kwargs: dict = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _openai_client = AsyncOpenAI(**kwargs)
    return _openai_client

# ---- 本地模型 (延迟加载) ----
_local_model = None

def _get_local_model():
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        # 使用本地缓存路径加载，避免联网检查
        import os
        os.environ["HF_HUB_OFFLINE"] = "1"
        model_path = _local_model_path or LOCAL_MODEL_ID
        logger.info(f"加载本地embedding模型: {model_path}")
        _local_model = SentenceTransformer(model_path)
    return _local_model


async def get_embedding(text: str) -> list[float]:
    """获取单条文本的embedding向量"""
    if settings.embedding_provider == "local":
        model = _get_local_model()
        vec = model.encode(text, normalize_embeddings=True)
        return vec.tolist()

    client = _get_openai_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=text,
    )
    return response.data[0].embedding


async def get_embeddings(texts: list[str]) -> list[list[float]]:
    """批量获取embedding向量"""
    if not texts:
        return []

    if settings.embedding_provider == "local":
        model = _get_local_model()
        vecs = model.encode(texts, normalize_embeddings=True, batch_size=64)
        return [v.tolist() for v in vecs]

    client = _get_openai_client()
    all_embeddings: list[list[float]] = []
    batch_size = 512
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = await client.embeddings.create(
            model=settings.embedding_model,
            input=batch,
        )
        all_embeddings.extend([d.embedding for d in response.data])
    return all_embeddings
