"""图片代理 — 绕过知识星球/知乎防盗链"""

import hashlib
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(prefix="/api/proxy", tags=["proxy"])

# 精确匹配的域名
ALLOWED_HOSTS = {"images.zsxq.com"}

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
