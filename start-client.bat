@echo off
chcp 65001 >nul
title 启动伴生引擎桌面客户端

echo ====================================================
echo  [*] 本地记忆与情感神经伴生引擎 - 桌面客户端极速启动
echo ====================================================

cd /d "%~dp0"

rem 检查 node_modules 是否安装
if not exist "node_modules" (
    echo [提示] 检测到尚未安装项目依赖，正在极速安装...
    call npm install
)

rem 构建后端与 Electron 代码
echo [1/2] 正在构建后端与桌面客户端代码...
call npm run build

rem 启动 Electron 客户端
echo [2/2] 正在唤醒桌面客户端与系统托盘...
npx electron dist-electron/main.js
