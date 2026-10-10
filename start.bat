@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
    py -3 -m venv .venv
    if errorlevel 1 goto failed
)
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto failed
if not exist .env copy .env.example .env >nul
echo.
echo 브라우저에서 http://127.0.0.1:8000 을 열어 주세요.
echo AI 키 없이도 기본 파일 분석은 동작합니다. 종료: Ctrl+C
.venv\Scripts\python.exe server.py
pause
exit /b
:failed
echo Python 3.11 이상과 인터넷 연결을 확인해 주세요.
pause
exit /b 1
