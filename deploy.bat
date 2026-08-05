@echo off
echo 🚀 开始部署 PDD SKU 管理系统...

docker-compose down
docker-compose up -d --build

echo.
echo ✅ 部署完成！
echo 📱 访问地址：http://服务器 IP:8080
echo.
echo 常用命令：
echo   查看日志：docker-compose logs -f
echo   停止服务：docker-compose down
echo   重启服务：docker-compose restart
echo   更新部署：deploy.bat

pause
