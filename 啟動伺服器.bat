@echo off
title R6 Map Veto Server
cd /d "%~dp0"
echo ============================================
echo   R6 Map Veto - 啟動中...
echo ============================================
echo.

:: 找本機IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  goto :found
)
:found
set IP=%IP: =%

echo 伺服器啟動後請用瀏覽器打開：
echo.
echo   本機:    http://localhost:3000
echo   區網:    http://%IP%:3000
echo.
echo 把區網網址傳給隊友即可連線！
echo ============================================
echo.

:: 等3秒後自動開啟瀏覽器
start /b cmd /c "timeout /t 3 >nul && start http://localhost:3000"

node server.js

pause
