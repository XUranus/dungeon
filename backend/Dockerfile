# ── Backend: Python 3.11 + Node.js ──
FROM python:3.11-slim

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python 依赖（从 pyproject.toml 安装，利用 Docker 缓存）──
COPY backend/pyproject.toml backend/
RUN cd backend && pip install --no-cache-dir hatchling && \
    pip install --no-cache-dir . 2>/dev/null || \
    pip install --no-cache-dir \
    fastapi "uvicorn[standard]" "sqlalchemy[asyncio]" aiosqlite alembic \
    chromadb httpx openai apscheduler beautifulsoup4 sse-starlette \
    "python-jose[cryptography]" rank-bm25 yfinance

# ── Node.js 依赖（爬虫脚本）──
COPY package.json package-lock.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install

COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev 2>/dev/null || npm install

# ── 复制源码 ──
COPY backend/ /app/backend/
COPY scripts/ /app/scripts/

# ── 数据目录（运行时挂载 volume）──
RUN mkdir -p /app/data/chroma /app/data/audit

# ── 如果没有 config.json，从 example 创建 ──
RUN if [ ! -f /app/backend/config.json ] && [ -f /app/backend/config.example.json ]; then \
    cp /app/backend/config.example.json /app/backend/config.json; fi

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
