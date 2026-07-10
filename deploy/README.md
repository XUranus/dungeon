# Dungeon Lord 部署指南

## 目录结构

```
deploy/
├── docker-compose.yml      # Docker Compose 编排
├── backend.Dockerfile       # 后端镜像（Python 3.11 + Node.js 20）
├── frontend.Dockerfile      # 前端镜像（Node 20 构建 + Nginx）
├── nginx/
│   └── default.conf         # Nginx 反向代理配置
├── deploy.py                # VPS 一键部署脚本（SSH/SFTP）
├── fix_deploy.py            # VPS 修复脚本（Python/nginx/systemd）
└── README.md                # 本文档
```

---

## 快速开始（本地 Docker）

### 前置条件

- Docker 20.10+ 及 Docker Compose v2
- 至少 2GB 可用内存（ChromaDB 向量库较占内存）

### 1. 准备配置文件

```bash
# 在项目根目录
cp backend/config.example.json backend/config.json
```

编辑 `backend/config.json`，填入必要的配置项（见下方「配置说明」）。

### 2. 构建并启动

```bash
cd deploy
docker compose up -d --build
```

首次构建约需 5-10 分钟（拉取基础镜像 + 安装依赖）。

### 3. 验证服务

```bash
# 检查容器状态
docker compose ps

# 检查后端健康
curl http://localhost:8000/api/health

# 访问前端（默认端口 6666）
curl -o /dev/null -w "%{http_code}" http://localhost:6666/
```

### 4. 常用操作

```bash
# 查看日志
docker compose logs -f backend
docker compose logs -f frontend

# 重启单个服务
docker compose restart backend

# 停止所有服务
docker compose down

# 重新构建（代码更新后）
docker compose up -d --build
```

---

## 配置说明

所有配置在 `backend/config.json` 中管理，支持后台设置页面热更新。

### 必填配置

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `openai_api_key` | OpenAI API Key（用于 LLM 对话和 Embedding） | `sk-...` |
| `openai_base_url` | OpenAI 兼容 API 地址（留空使用官方） | `https://api.openai.com/v1` |
| `openai_model` | LLM 模型名称 | `gpt-4o` |
| `zsxq_cookie` | 知识星球登录 Cookie | 浏览器 DevTools 获取 |
| `zsxq_group_id` | 知识星球小组 ID | `1234567890` |

### 可选配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `api_key` | `deepdarkfantasy` | 后台管理 API Key |
| `crawl_interval_minutes` | `0` | 定时采集间隔（分钟），0=禁用 |
| `insight_report_interval_minutes` | `480` | 定期观点总结间隔（分钟） |
| `insight_report_ndays` | `3` | 观点总结覆盖天数 |
| `notifyhub_url` | `""` | NotifyHub 推送地址 |
| `notifyhub_key` | `""` | NotifyHub API Key |
| `notifyhub_to` | `"*"` | 推送目标 |
| `embedding_provider` | `openai` | Embedding 提供商（openai/huggingface） |
| `embedding_model` | `text-embedding-3-small` | Embedding 模型 |
| `enable_bm25` | `true` | 启用 BM25 混合检索 |
| `chunk_size` | `500` | 文本分块大小 |
| `enable_tools` | `true` | 启用 LLM 工具调用 |
| `public_chat_daily_limit` | `10` | 公开页面每日问答次数限制 |

---

## VPS 部署

### 方式一：一键脚本部署

```bash
# 全量部署（安装 Docker + 上传代码 + 构建启动）
python deploy/deploy.py

# 仅同步数据（快速更新，不重新构建）
python deploy/deploy.py --data
```

脚本会自动：
1. 检测并安装 Docker
2. 通过 SFTP 上传项目文件
3. 备份远端 config.json
4. 构建并启动容器
5. 等待健康检查通过
6. 开放防火墙端口

**注意：** 脚本中的 VPS 连接信息（`VPS_HOST`、`VPS_PORT` 等）需要根据你的服务器修改。

### 方式二：手动部署

```bash
# 1. 克隆项目
ssh root@your-server
cd /opt
git clone https://github.com/XUranus/dungeon.git dungeon-lord
cd dungeon-lord

# 2. 配置
cp backend/config.example.json backend/config.json
vim backend/config.json  # 填入配置

# 3. 启动
cd deploy
echo "FRONTEND_PORT=6666" > .env
docker compose up -d --build

# 4. 验证
docker compose ps
curl http://localhost:8000/api/health
```

### 方式三：非 Docker 部署

如果不想用 Docker，可以参考 `deploy/fix_deploy.py` 中的 systemd 服务配置：

```bash
# 安装 Python 依赖
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# 配置 nginx
cp deploy/nginx/default.conf /etc/nginx/conf.d/dungeon-lord.conf
# 修改其中的路径为实际路径
nginx -t && systemctl restart nginx

# 创建 systemd 服务
cat > /etc/systemd/system/dungeon-lord.service << 'EOF'
[Unit]
Description=Dungeon Lord Backend
After=network.target

[Service]
Type=exec
User=root
WorkingDirectory=/opt/dungeon-lord
Environment=PATH=/opt/dungeon-lord/backend/.venv/bin
ExecStart=/opt/dungeon-lord/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now dungeon-lord
```

---

## Nginx 配置

`deploy/nginx/default.conf` 提供了完整的反向代理配置：

- **API 代理**：`/api/` → `backend:8000`（Docker 内部通信）
- **图片代理**：`/api/proxy/images/` → 本地图片目录（30 天缓存）
- **SSE 支持**：关闭缓冲，支持流式响应
- **SPA 路由**：所有非文件请求回退到 `index.html`
- **Gzip 压缩**：启用文本/JS/CSS/SVG 压缩
- **静态缓存**：`/assets/` 30 天强缓存

如果你使用自定义域名或 HTTPS，需要在 `default.conf` 基础上添加 SSL 配置（推荐使用 Certbot + Let's Encrypt）。

---

## 数据持久化

Docker 部署通过 volume 挂载实现数据持久化：

```
../data/                     # 项目数据目录
├── app.db                   # SQLite 数据库
├── chroma/                  # ChromaDB 向量库
├── audit/                   # LLM 审计日志
└── images/                  # 下载的图片
```

**重要：** `data/` 目录已加入 `.dockerignore`，不会被复制到镜像中，必须通过 volume 挂载。

---

## 环境变量

在 `deploy/` 目录下创建 `.env` 文件：

```bash
# 前端对外端口（默认 6666）
FRONTEND_PORT=6666
```

---

## 更新部署

### Docker 方式

```bash
cd deploy

# 拉取最新代码
cd .. && git pull && cd deploy

# 重新构建并启动
docker compose up -d --build

# 仅重启后端（前端无变化时）
docker compose restart backend
```

### 非 Docker 方式

```bash
cd /opt/dungeon-lord
git pull

# 重启后端
systemctl restart dungeon-lord

# 重新构建前端
cd frontend && npm run build && cd ..
```

---

## 故障排查

### 容器启动失败

```bash
# 查看容器日志
docker compose logs backend
docker compose logs frontend

# 检查容器状态
docker compose ps
```

### 后端无法连接数据库

确保 `data/` 目录存在且有写入权限：

```bash
mkdir -p data/chroma data/images
chmod -R 755 data/
```

### 前端页面空白

检查 API 代理是否正常：

```bash
curl -v http://localhost:6666/api/health
```

### 知乎/知识星球采集失败

通常是 Cookie 过期，更新 `backend/config.json` 中对应的 cookie 字段，然后重启后端：

```bash
docker compose restart backend
```

### LLM API 报错

检查 `openai_api_key` 和 `openai_base_url` 是否正确。如果使用代理服务，确保 base_url 包含 `/v1` 后缀。

---

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 6666 | Frontend (Nginx) | 对外访问端口，可通过 `.env` 修改 |
| 8000 | Backend (Uvicorn) | 仅容器内部访问，不对外暴露 |
