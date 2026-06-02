@echo off
title R6 Map Veto - 網際網路版
cd /d "%~dp0"

echo ============================================
echo   1. 啟動本地伺服器...
echo ============================================
start /b node server.js

echo.
echo ============================================
echo   2. 正在產生全世界都能連的公開網址...
echo   (請稍候，可能會需要幾秒鐘)
echo ============================================
echo.
echo 產生成功後，請將「your url is: https://...」的網址貼給你的隊友！
echo 注意：第一次連線進入網址時，會出現一個警告畫面。
echo 請點擊畫面上的「Click to Continue」按鈕即可進入系統。
echo.

npx localtunnel --port 3000

pause
