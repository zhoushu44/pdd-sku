# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder

WORKDIR /app

# 利用 Docker 层缓存：先只拷贝依赖描述文件
COPY package.json package-lock.json* ./

# 安装依赖（使用 npm ci 以获得可复现的构建）
RUN npm ci

# 拷贝源码并构建
COPY . .

RUN npm run build

# ---------- 运行阶段 ----------
FROM nginx:1.27-alpine

# 清空 nginx 默认配置目录，放入自定义配置
RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 将构建产物拷贝到 nginx 服务目录
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 5173

# 显式使用 exec 形式，避免启动参数中的 "daemon off;" 被错误拆分
CMD ["nginx", "-g", "daemon off;"]
