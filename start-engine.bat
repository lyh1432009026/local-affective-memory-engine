@echo off
title Local Affective Memory Engine v2.4
echo ====================================================
echo Starting Local Affective Memory Engine v2.4
echo Listening on http://127.0.0.1:4100/v1
echo Integrated with DeepSeek Harness
echo ====================================================
cd /d "%~dp0"

:: 自动读取 .env 中的 DEEPSEEK_API_KEY 或 CLOUD_API_KEY 导出到环境
for /f "usebackq tokens=1,2 delims==" %%A in (`findstr /v "^#" .env 2^>nul`) do (
    if "%%A"=="DEEPSEEK_API_KEY" set DEEPSEEK_API_KEY=%%B
    if "%%A"=="CLOUD_API_KEY" if not defined DEEPSEEK_API_KEY set DEEPSEEK_API_KEY=%%B
)

node dist/index.js
pause
