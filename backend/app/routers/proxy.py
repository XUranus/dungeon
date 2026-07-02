"""图片代理 — 绕过知识星球/知乎防盗链 + 本地图片服务"""

import hashlib
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

router = APIRouter(prefix="/api/proxy", tags=["proxy"])

# 本地图片目录（resolved once at module level）
_IMAGES_DIR = (Path(__file__).resolve().parent.parent.parent.parent / "data" / "images").resolve()


@router.get("/images/{path:path}")
async def serve_local_image(path: str):
    """提供本地存储的图片"""
    try:
        full_path = (_IMAGES_DIR / path).resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="无效路径")
    if not full_path.is_relative_to(_IMAGES_DIR):
        raise HTTPException(status_code=403, detail="禁止访问")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(full_path, headers={"Cache-Control": "public, max-age=604800, immutable"})

# 精确匹配的域名
ALLOWED_HOSTS = {"images.zsxq.com", "article-images.zsxq.com"}

# 后缀匹配的域名 (pic1.zhimg.com, pic2.zhimg.com 等)
ALLOWED_SUFFIXES = (".zhimg.com",)


def _is_host_allowed(hostname: str | None) -> bool:
    if not hostname:
        return False
    if hostname in ALLOWED_HOSTS:
        return True
    return any(hostname.endswith(s) for s in ALLOWED_SUFFIXES)


# 缓存 7 天
CACHE_HEADER = "public, max-age=604800, immutable"


@router.get("/image")
async def proxy_image(url: str = Query(..., description="原始图片 URL")):
    """代理图片，去掉 Referer 头绕过防盗链"""
    parsed = urlparse(url)
    if not _is_host_allowed(parsed.hostname):
        raise HTTPException(status_code=403, detail="不允许代理此域名的图片")

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"Referer": ""})
            # 验证重定向后的最终域名仍在允许列表中
            final_host = urlparse(str(resp.url)).hostname
            if not _is_host_allowed(final_host):
                raise HTTPException(status_code=403, detail="重定向到不允许的域名")
    except HTTPException:
        raise
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"获取图片失败: {e}")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"上游返回 {resp.status_code}")

    content_type = resp.headers.get("content-type", "image/jpeg")
    etag = hashlib.md5(url.encode()).hexdigest()

    return Response(
        content=resp.content,
        media_type=content_type,
        headers={
            "Cache-Control": CACHE_HEADER,
            "ETag": etag,
        },
    )
