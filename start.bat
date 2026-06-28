@echo off
chcp 65001 >nul
title Unitpulse 测试平台

echo ╔══════════════════════════════════════════╗
echo ║   Unitpulse 测试可视化平台               ║
echo ╚══════════════════════════════════════════╝
echo.

:: ============================================================
:: 1. 检测 Node.js
:: ============================================================
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set NODE_CMD=node
    set NPM_CMD=npm
    goto :found_node
)

:: 尝试常见安装路径
set NODE_PATHS=D:\Nodejs;D:\nodejs;C:\Program Files\nodejs
for %%p in (%NODE_PATHS%) do (
    if exist "%%p\node.exe" (
        set "PATH=%%p;%PATH%"
        set NODE_CMD=%%p\node.exe
        set NPM_CMD=%%p\npm.cmd
        goto :found_node
    )
)

echo [错误] 未找到 Node.js！
echo.
echo 请先安装 Node.js: https://nodejs.org
echo 或将 node.exe 所在目录添加到系统 PATH。
echo.
pause
exit /b 1

:found_node
echo [✓] Node.js 版本:
%NODE_CMD% --version

:: ============================================================
:: 2. 检查 node_modules
:: ============================================================
if not exist "node_modules" (
    echo.
    echo [信息] 首次运行，正在安装依赖...
    call :setup
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

:: ============================================================
:: 3. 检查 .env
:: ============================================================
if not exist ".env" (
    echo.
    echo [信息] 未找到 .env 文件，从 .env.example 创建
    copy .env.example .env >nul
    echo [✓] 已创建 .env，请根据需要修改配置
)

:: ============================================================
:: 4. 启动服务
:: ============================================================
echo.
echo [信息] 启动服务器...
echo.
echo   访问地址: http://localhost:3000
echo   按 Ctrl+C 停止服务
echo.

%NODE_CMD% server\app.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 服务器异常退出 (代码: %ERRORLEVEL%)
    pause
)

exit /b %ERRORLEVEL%

:: ============================================================
:: 依赖安装子流程
:: ============================================================
:setup
echo.
echo ─── 安装 Node.js 依赖 ───
%NPM_CMD% install
if %ERRORLEVEL% NEQ 0 (
    echo [错误] npm install 失败
    exit /b 1
)
echo [✓] 依赖安装完成

echo.
echo ─── 检查 Python ───
set PYTHON_FOUND=0
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 set PYTHON_FOUND=1

if %PYTHON_FOUND% EQU 0 (
    for %%p in (C:\Python312 C:\Python313 C:\Python314) do (
        if exist "%%p\python.exe" (
            set "PATH=%%p;%%p\Scripts;%PATH%"
            set PYTHON_FOUND=1
            goto :py_done
        )
    )
)

:py_done
if %PYTHON_FOUND% EQU 1 (
    for /f "tokens=*" %%v in ('python --version 2^>nul') do echo [✓] %%v
) else (
    echo [警告] 未检测到 Python
    echo 运行 pytest 测试需要 Python 环境
)

exit /b 0
