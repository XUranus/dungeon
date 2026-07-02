"""图片本地存储服务 — 下载远程图片到 data/images/，按 URL hash 去重"""

import hashlib
import logging
from pathlib import Path
from urllib.parse import urlparse, unquote

import httpx

logger = logging.getLogger(__name__)

# 图片存储根目录
_IMAGES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "images"

# 允许下载的域名（与 proxy.py 保持一致）
ALLOWED_HOSTS = {"images.zsxq.com", "article-images.zsxq.com"}
ALLOWED_SUFFIXES = (".zhimg.com",)

# 下载超时
DOWNLOAD_TIMEOUT = 20.0


def _is_allowed(url: str) -> bool:
    hostname = urlparse(url).hostname
    if not hostname:
        return False
    if hostname in ALLOWED_HOSTS:
        return True
    return any(hostname.endswith(s) for s in ALLOWED_SUFFIXES)


def _url_to_filename(url: str) -> str:
    """URL → hash.ext 文件名"""
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    # 从 URL 推断扩展名
    path = urlparse(url).path
    ext = Path(unquote(path)).suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"):
        ext = ".jpg"
    return f"{url_hash}{ext}"


def ensure_images_dir() -> Path:
    """确保 images 目录存在"""
    _IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    return _IMAGES_DIR


def get_local_path(url: str) -> str | None:
    """检查图片是否已下载，返回相对路径或 None"""
    filename = _url_to_filename(url)
    full_path = _IMAGES_DIR / filename
    if full_path.exists() and full_path.stat().st_size > 0:
        return f"images/{filename}"
    return None


async def download_image(url: str) -> str | None:
    """下载单张图片到本地，返回相对路径 images/{filename}。已存在则跳过。

    Args:
        url: 远程图片 URL

    Returns:
        成功返回 "images/{filename}"，失败返回 None
    """
    if not _is_allowed(url):
        logger.debug("跳过不允许的域名: %s", url[:80])
        return None

    ensure_images_dir()
    filename = _url_to_filename(url)
    full_path = _IMAGES_DIR / filename

    # 已存在则跳过
    if full_path.exists() and full_path.stat().st_size > 0:
        return f"images/{filename}"

    try:
        async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers={"Referer": ""})
            resp.raise_for_status()
            # 验证重定向后的最终域名仍在允许列表中
            final_host = urlparse(str(resp.url)).hostname
            if not _is_allowed(str(resp.url)):
                logger.warning("图片重定向到不允许的域名: %s -> %s", url[:60], resp.url)
                return None
    except Exception as e:
        logger.warning("图片下载失败: %s: %s", url[:80], e)
        return None

    content = resp.content
    if len(content) < 100:
        logger.warning("图片内容过小(%d bytes), 跳过: %s", len(content), url[:80])
        return None

    full_path.write_bytes(content)
    logger.debug("图片已保存: %s (%d bytes)", filename, len(content))
    return f"images/{filename}"


def update_images_local_path(images: list[dict] | None, local_paths: dict[str, str]) -> list[dict] | None:
    """更新 images 列表，添加 local_path 字段。

    Args:
        images: 原始 images JSON 列表
        local_paths: {远程URL: 本地相对路径} 映射

    Returns:
        更新后的 images 列表
    """
    if not images or not isinstance(images, list):
        return images

    updated = []
    for img in images:
        if not isinstance(img, dict):
            updated.append(img)
            continue
        img = dict(img)  # copy
        # 检查各个可能的 URL 字段
        for url_key in ("url",):
            url_val = img.get(url_key)
            if url_val and url_val in local_paths:
                img["local_path"] = local_paths[url_val]
                break
        # 检查嵌套的 thumbnail/large
        for nested_key in ("thumbnail", "large"):
            nested = img.get(nested_key)
            if isinstance(nested, dict):
                nested_url = nested.get("url")
                if nested_url and nested_url in local_paths:
                    nested["local_path"] = local_paths[nested_url]
        updated.append(img)
    return updated


def get_image_absolute_path(relative_path: str) -> Path | None:
    """获取图片绝对路径，用于静态文件服务"""
    full_path = _IMAGES_DIR.parent / relative_path
    if full_path.exists():
        return full_path
    return None
