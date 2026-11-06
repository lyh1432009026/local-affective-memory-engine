@echo off
chcp 65001 >nul
title 启动 Local Affective Memory Engine (Docker)

echo ====================================================
echo  🚀 本地记忆与情感神经伴生引擎 - Docker 一键启动
echo ====================================================

cd /d "%~dp0"

:: 检查 Docker 是否安装
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Docker 运行环境！
    echo 请先安装并启动 Docker Desktop: https://www.docker.com/products/docker-desktop/
    echo 若无需 Docker，请直接双击运行 start-engine.bat 或桌面客户端。
    echo ====================================================
    pause
    exit /b 1
)

:: 检查 .env 文件是否存在，不存在则引导复制
if not exist ".env" (
    if exist ".env.example" (
        echo [提示] 未找到 .env 配置文件，正在从 .env.example 自动生成...
        copy .env.example .env >nul
        echo [完成] 已生成 .env，请按需填入 CLOUD_API_KEY 后重新启动。
    )
)

:: 确保 data 目录存在
if not exist "data" mkdir "data"

echo.
echo [1/2] 正在构建与启动 Docker 容器...
docker compose up -d --build

if %errorlevel% neq 0 (
    echo.
    echo [失败] Docker 构建或启动异常，请检查 Docker Desktop 服务是否正常开启。
    pause
    exit /b 1
)

echo.
echo [2/2] 容器启动成功！
echo  - 服务端点: http://127.0.0.1:4100/v1
echo  - 控制台 UI: http://127.0.0.1:4100
echo  - 竞技场 UI: http://127.0.0.1:4100/arena
echo ====================================================
echo 正在打开控制面板...
timeout /t 2 >nul
start http://127.0.0.1:4100
echo 如需查看日志，可运行: docker compose logs -f
pause
