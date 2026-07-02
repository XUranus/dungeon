# 📊 财经大V观点分析系统

爬取星主在知识星球/知乎上的发言，基于 RAG 提供问答服务。

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Python + FastAPI |
| 数据库 | SQLite + ChromaDB |
| 前端 | React + TypeScript + Vite |
| LLM | OpenAI 兼容接口（默认 GPT-4o） |
| Embedding | OpenAI text-embedding-3-small / 本地 bge-small-zh-v1.5 |
| 检索 | Dense 向量 + BM25 稀疏 + RRF 融合排序 |
| 部署 | Docker Compose + Nginx 反代 |

## 快速开始

### Docker 部署（推荐）

```bash
# 1. 配置对外端口
echo "FRONTEND_PORT=6666" > .env

# 2. 编辑 backend/config.json，填入必要配置：
#    - openai_api_key / openai_base_url
#    - zsxq_cookie / zsxq_group_id（知识星球）
#    - zhihu_cookie / zhihu_url_token（知乎，可选）

# 3. 启动
docker compose up -d

# 访问 http://localhost:6666
# 登录使用 config.json 中的 api_key（默认: deepdarkfantasy）
```

### 本地开发

```bash
# 后端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev    # 默认 http://localhost:5173
```

## 核心功能

### 1. 数据采集
- 知识星球：主题、评论、专栏文章、精华标记
- 知乎：回答、想法（pin）
- 增量爬取 + 自动去重

### 2. 智能问答（RAG）
- **混合检索**：Dense 向量 + BM25 关键词 + RRF 融合排序
- **时效性加权**：7天内 ×2.0、30天内 ×1.5、90天内 ×1.2
- **观点冲突检测**：同一话题新旧观点矛盾时以最新为准
- **作者归属**：区分星主与嘉宾/球友的观点，不张冠李戴
- **工具调用**：实时股票行情、网络搜索（Tavily）

### 3. 教授指数
- 从历史文章中提取持仓配置（内地版 / 全球版）
- AI 自动解析 + 定时任务

### 4. 对外 API（MCP 协议）
- 统一 API Key 鉴权
- 流式问答、知识库搜索、主题列表、教授指数

## 鉴权

系统使用**单一 API Key**（类似 OpenAI / Anthropic 模式）：

- 管理后台和外部 MCP API 共用同一个 Key
- 默认 Key：`deepdarkfantasy`
- 可在「设置 → API」页面刷新生成新 Key
- 请求头：`Authorization: Bearer <api_key>`

## 项目结构

```
backend/
  app/
    crawlers/            # zsxq.py, zhihu.py
    routers/
      auth.py            # API Key 管理（verify/key/refresh）
      chat.py            # 管理后台问答
      mcp.py             # 外部 MCP API
      topics.py          # 主题浏览
      sources.py         # 数据采集触发
      settings.py        # 系统设置
      holdings.py        # 持仓管理
      professor_index.py # 教授指数
      proxy.py           # 图片代理
    services/
      rag.py             # RAG 问答引擎（混合检索 + 工具调用）
      hybrid_retriever.py # BM25 + Dense + RRF 融合
      ingestion.py       # 数据采集入库 + Embedding
      tools.py           # 工具注册（搜索、行情）
      professor_index.py # 教授指数解析
      image_store.py     # 图片下载存储
      vectorstore.py     # ChromaDB 封装
      embedding.py       # Embedding 服务
      llm_client.py      # LLM 客户端
    auth.py              # API Key 验证
    config.py            # 配置管理（config.json）
    models.py            # SQLAlchemy 模型
    main.py              # FastAPI 入口
    utils/
      streaming.py       # Vercel AI SDK SSE 流协议
      text.py            # 文本切分
frontend/
  src/
    pages/               # ChatPage, TopicsPage, DashboardPage, SettingsPage, LoginPage
    components/          # ChatPanel, Sidebar, ArticleContent, ImageGallery
    contexts/            # AuthContext
    services/            # api.ts
    utils/               # sse.ts
deploy/
  nginx/default.conf     # Nginx 反代配置
scripts/                 # 回填、部署脚本
```

## API 接口

### 管理后台（需鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/verify` | 验证 API Key |
| GET | `/api/auth/key` | 获取 Key 预览 |
| PUT | `/api/auth/key/refresh` | 刷新 Key |
| POST | `/api/chat` | 流式问答（SSE） |
| GET | `/api/topics` | 主题列表（分页） |
| GET | `/api/sources/platforms` | 已配置的平台 |
| POST | `/api/sources/crawl` | 全量爬取 |
| POST | `/api/sources/crawl/{platform}` | 爬取指定平台 |
| GET | `/api/sources/tasks` | 爬取历史 |
| GET | `/api/settings/system-info` | 系统信息 |

### 外部 MCP API（需鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/mcp/chat` | 流式问答（SSE） |
| POST | `/api/mcp/search` | 知识库搜索 |
| GET | `/api/mcp/topics` | 主题列表 |
| GET | `/api/mcp/professor-index` | 教授指数 |

```bash
# 示例：调用 MCP 问答
curl -X POST http://localhost:6666/api/mcp/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"叫兽最近看好什么？"}'

# 示例：搜索知识库
curl -X POST http://localhost:6666/api/mcp/search \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"半导体 推荐"}'
```

## 配置说明

配置文件 `backend/config.json`，主要字段：

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `api_key` | 统一 API Key | `deepdarkfantasy` |
| `openai_api_key` | LLM API Key | - |
| `openai_base_url` | LLM 接口地址 | - |
| `openai_model` | LLM 模型名 | `gpt-4o` |
| `embedding_provider` | Embedding 提供者 | `openai` |
| `embedding_model` | Embedding 模型 | `text-embedding-3-small` |
| `zsxq_cookie` | 知识星球 Cookie | - |
| `zsxq_group_id` | 知识星球 ID | - |
| `zhihu_cookie` | 知乎 Cookie | - |
| `zhihu_url_token` | 知乎用户 URL Token | - |
| `enable_tools` | 启用工具调用 | `true` |
| `tavily_api_key` | Tavily 搜索 Key | - |
| `enable_bm25` | 启用 BM25 检索 | `true` |
| `chunk_size` | 文本切分大小 | `500` |
| `api_port` | 后端监听端口 | `8000` |
