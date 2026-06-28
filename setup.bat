@echo off
chcp 65001 >nul
title Unitpulse 项目初始化

echo ╔══════════════════════════════════════════╗
echo ║   Unitpulse 测试平台 — 项目初始化       ║
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

set NODE_PATHS=D:\Nodejs;D:\nodejs;C:\Program Files\nodejs
for %%p in (%NODE_PATHS%) do (
    if exist "%%p\node.exe" (
        set "PATH=%%p;%PATH%"
        set NODE_CMD=%%p\node.exe
        set NPM_CMD=%%p\npm.cmd
        goto :found_node
    )
)

echo [错误] 未找到 Node.exe！
echo 请先安装 Node.js (https://nodejs.org) 或将安装目录加入 PATH。
pause
exit /b 1

:found_node
echo [✓] Node.js: 
%NODE_CMD% --version

:: ============================================================
:: 2. 安装 Node.js 依赖
:: ============================================================
echo.
echo ─── 安装 Node.js 依赖 ───
%NPM_CMD% install
if %ERRORLEVEL% NEQ 0 (
    echo [错误] npm install 失败，请检查网络连接
    pause
    exit /b 1
)
echo [✓] Node.js 依赖安装完成

:: ============================================================
:: 3. 创建 .env
:: ============================================================
if not exist ".env" (
    echo.
    echo ─── 创建 .env 配置文件 ───
    copy .env.example .env >nul
    echo [✓] 已从 .env.example 创建 .env
    echo [i] 请根据需要编辑 .env 中的配置
) else (
    echo.
    echo [i] .env 已存在，跳过
)

:: ============================================================
:: 4. 检查 Python
:: ============================================================
echo.
echo ─── 检查 Python 环境 ───
set PYTHON_CMD=python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    :: 尝试常见路径
    set PYTHON_PATHS=C:\Python312;C:\Python313;C:\Python314
    for %%p in (%PYTHON_PATHS%) do (
        if exist "%%p\python.exe" (
            set "PATH=%%p;%%p\Scripts;%PATH%"
            set PYTHON_CMD=%%p\python.exe
            goto :found_python
        )
    )
    goto :no_python
)

:found_python
%PYTHON_CMD% --version
echo [✓] Python 已就绪

:: 检查 pytest
%PYTHON_CMD% -m pytest --version >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [✓] pytest 已安装
) else (
    echo [信息] 正在安装 pytest...
    %PYTHON_CMD% -m pip install pytest pytest-playwright -q
    if %ERRORLEVEL% EQU 0 (
        echo [✓] pytest 安装完成
    ) else (
        echo [警告] pytest 安装失败，请手动安装:
        echo   pip install pytest pytest-playwright
    )
)

:: 检查 playwright (Python)
%PYTHON_CMD% -c "import playwright" 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [✓] playwright (Python) 已安装
) else (
    echo [信息] 正在安装 playwright Python 库...
    %PYTHON_CMD% -m pip install playwright -q
    if %ERRORLEVEL% EQU 0 (
        %PYTHON_CMD% -m playwright install chromium --only-shell -q
        echo [✓] playwright 安装完成
    ) else (
        echo [警告] playwright 安装失败
    )
)
goto :check_browser

:no_python
echo [警告] 未检测到 Python
echo 运行 pytest 测试需要 Python 3.8+
echo 下载: https://www.python.org/downloads/
echo 或已安装但在以下路径，可手动加入 PATH:
echo   C:\Python314
echo   C:\Python313
echo   C:\Python312

:: ============================================================
:: 5. 检查 Playwright 浏览器 (用于 codegen)
:: ============================================================
echo.
echo ─── 检查 Playwright 浏览器 ───
%NODE_CMD% -e "
try {
    var { execSync } = require('child_process');
    var r = execSync('npx playwright install --dry-run 2>&1 || echo MISSING', {shell:true});
    process.exit(0);
} catch(e) { process.exit(1); }
" >nul 2>nul

where chrome.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [✓] 系统已安装 Chrome，codegen 可使用 --channel chrome
) else (
    echo [i] 未检测到系统 Chrome
    echo codegen 功能需要 Chrome 或 Playwright 内置浏览器
)

:: ============================================================
:: 完成
:: ============================================================
echo.
echo ══════════════════════════════════════════
echo  初始化完成！运行 start.bat 启动服务
echo ══════════════════════════════════════════
echo.

pause
