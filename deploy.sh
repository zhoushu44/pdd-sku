#!/bin/bash

echo "🚀 开始部署 PDD SKU 管理系统..."

# 自动探测服务器对外 IP，写入 data/server-info.json
# 供网页「mcp」按钮一键复制时，把 localhost 替换为真实的部署 IP
detect_ip() {
  curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null \
    || curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}'
}

mkdir -p data
SERVER_IP="$(detect_ip)"
if [ -n "$SERVER_IP" ]; then
  printf '{"host":"%s"}\n' "$SERVER_IP" > data/server-info.json
  echo "🌐 已记录部署 IP：$SERVER_IP"
else
  echo "⚠️  未能自动探测服务器 IP，网页将回退使用当前访问地址"
fi

# 停止并删除旧容器
docker-compose down

# 构建并启动
docker-compose up -d --build

echo ""
echo "✅ 部署完成！"
echo "📱 访问地址：http://${SERVER_IP:-服务器 IP}:5173"
echo ""
echo "常用命令："
echo "  查看日志：docker-compose logs -f"
echo "  停止服务：docker-compose down"
echo "  重启服务：docker-compose restart"
echo "  更新部署：./deploy.sh"
