# 📊 财经大V观点分析系统

爬取星主在知识星球/知乎上的发言，基于 RAG 提供问答服务。

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Python + FastAPI |
| 数据库 | SQLite + ChromaDB |
| 前端 | React + TypeScript + Vite |
| LLM | OpenAI GPT-4o |
| Embedding | OpenAI text-embedding-3-small / 本地 bge-small-zh-v1.5 |

## 快速开始

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env: 填入 OPENAI_API_KEY、AUTHOR_NAME
# 填入至少一个平台的 Cookie 和 ID

# 2. 启动后端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000

# 3. 启动前端
cd frontend
npm install
npm run dev
```

## 使用流程

1. 在「数据采集」页面点击「全部爬取」
2. 在「数据浏览」页面查看已爬取的内容
3. 在「问答」页面提问

## 项目结构

```
backend/
  app/
    crawlers/       # zhihu.py, zsxq.py
    services/       # ingestion, rag, embedding, vectorstore
    routers/        # chat, topics, sources
    models.py       # Topic, Comment, CrawlTask, SemanticChunk
frontend/
  src/
    pages/          # ChatPage, TopicsPage, SourcesPage, SettingsPage
    components/     # ChatPanel, Sidebar
data/               # SQLite + ChromaDB
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | RAG问答 (SSE流式) |
| GET | `/api/topics` | 浏览数据 |
| GET | `/api/sources/platforms` | 已配置的平台 |
| POST | `/api/sources/crawl` | 爬取全部平台 |
| POST | `/api/sources/crawl/{platform}` | 爬取指定平台 |
| GET | `/api/sources/tasks` | 爬取历史 |
