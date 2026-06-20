# ── Stage 1: Build ──
FROM node:20-alpine AS build

WORKDIR /app

# 先复制依赖文件，利用缓存
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# 复制源码并构建
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Serve ──
FROM nginx:alpine

# 复制构建产物
COPY --from=build /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
