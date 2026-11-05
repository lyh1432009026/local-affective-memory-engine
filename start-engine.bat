@echo off
title Local Affective Memory Engine v2.4
echo ====================================================
echo Starting Local Affective Memory Engine v2.4
echo Listening on http://127.0.0.1:4100/v1
echo Integrated with DeepSeek Harness
echo ====================================================
cd /d "%~dp0"
node dist/index.js
pause
