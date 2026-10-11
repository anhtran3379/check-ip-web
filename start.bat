@echo off
chcp 65001 >nul
title IP Inspector - Kiem tra IP May Tinh
echo ===================================================
echo   Khoi dong IP Inspector Web Application...
echo ===================================================

cd /d "%~dp0"

IF NOT EXIST ".venv\Scripts\python.exe" (
    echo [!] Khong tim thay moi truong ao (.venv). Dang tao moi...
    python -m venv .venv
    if errorlevel 1 goto :failed
    echo [*] Dang cai dat thu vien...
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    if errorlevel 1 goto :failed
)

echo [*] Dang chay ung dung tren cong 8000...
.\.venv\Scripts\python.exe run.py
if errorlevel 1 goto :failed
pause
exit /b 0

:failed
echo [!] Khoi dong that bai. Kiem tra thong bao loi ben tren.
pause
exit /b 1
