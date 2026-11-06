#!/usr/bin/env bash
set -e

echo "===================================================="
echo " 🚀 本地记忆与情感神经伴生引擎 - Docker 一键启动"
echo "===================================================="

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "[错误] 未检测到 Docker 运行环境！"
    echo "请先安装 Docker: https://docs.docker.com/engine/install/"
    exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "[提示] 未检测到 .env，正在从 .env.example 自动生成..."
        cp .env.example .env
        echo "[完成] 已生成 .env，建议先根据实际情况配置云端 API Key。"
    fi
fi

# 确保持久化目录存在
mkdir -p data

echo ""
echo "[1/2] 正在构建与拉起 Docker 容器..."
docker compose up -d --build

echo ""
echo "[2/2] 部署成功并已转入后台运行！"
echo " - 服务端点: http://127.0.0.1:4100/v1"
echo " - 控制台 UI: http://127.0.0.1:4100"
echo " - 竞技场 UI: http://127.0.0.1:4100/arena"
echo "===================================================="
echo "查看容器实时日志: docker compose logs -f"
echo "停止容器服务:     docker compose down"
