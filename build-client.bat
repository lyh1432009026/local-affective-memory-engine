@echo off
chcp 65001 >nul
title 打包本地伴生引擎独立桌面客户端 (无需任何环境)

echo ====================================================
echo  [*] 本地记忆与情感神经伴生引擎 - 桌面客户端打包
echo  说明：打包产物内置 Node.js 运行时，免安装、零依赖开箱即用
echo ====================================================

cd /d "%~dp0"

rem 设置国内镜像加速，确保 electron-builder 资源秒级拉取
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

echo.
echo [1/3] 正在全量编译 TypeScript 源码...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 源码编译失败，请检查错误输出。
    pause
    exit /b 1
)

echo.
echo [2/3] 正在调用 electron-builder 进行打包构建...
call npm run client:pack
if %errorlevel% neq 0 (
    echo [错误] 客户端打包构建异常。
    pause
    exit /b 1
)

echo.
echo ====================================================
echo [3/3] 打包完成！
echo 独立客户端免安装绿色目录位于: release\win-unpacked\
echo 包含独立可执行文件: release\win-unpacked\LocalAffectiveEngine.exe
echo.
echo [提示] 发送给其他人时：直接将 release\win-unpacked 整个文件夹打压缩包发给对方，
echo 对方电脑无需安装 Node.js、无需配置环境，解压双击即可运行！
echo ====================================================
pause
