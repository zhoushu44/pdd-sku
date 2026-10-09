@echo off
setlocal enabledelayedexpansion
echo 🚀 开始部署 PDD SKU 管理系统...

REM 自动探测服务器对外 IP，写入 data\server-info.json
REM 供网页「mcp」按钮一键复制时，把 localhost 替换为真实的部署 IP
set "SERVER_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try{(Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 5).Trim()}catch{try{(Invoke-RestMethod -Uri 'https://ifconfig.me/ip' -TimeoutSec 5).Trim()}catch{(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object {$_.IPAddress -notlike '169.254.*'} ^| Select-Object -First 1 -ExpandProperty IPAddress)}}"`) do set "SERVER_IP=%%i"

if not exist data mkdir data
if defined SERVER_IP (
  >data\server-info.json echo {"host":"!SERVER_IP!"}
  echo 🌐 已记录部署 IP：!SERVER_IP!
) else (
  echo ⚠️  未能自动探测服务器 IP，网页将回退使用当前访问地址
)

docker-compose down
docker-compose up -d --build

echo.
echo ✅ 部署完成！
if defined SERVER_IP (
  echo 📱 访问地址：http://!SERVER_IP!:5173
) else (
  echo 📱 访问地址：http://服务器 IP:5173
)
echo.
echo 常用命令：
echo   查看日志：docker-compose logs -f
echo   停止服务：docker-compose down
echo   重启服务：docker-compose restart
echo   更新部署：deploy.bat

endlocal
pause
