@echo off
title IP Inspector - Kiem tra IP May Tinh
echo ===================================================
echo   Khoi dong IP Inspector Web Application...
echo ===================================================

cd /d "%~dp0"

IF NOT EXIST ".venv\Scripts\python.exe" (
    echo [!] Khong tim thay moi truong ao (.venv). Dang tao moi...
    python -m venv .venv
    echo [*] Dang cai dat thu vien...
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
)

echo [*] Dang chay ung dung tren cong 8000...
.\.venv\Scripts\python.exe run.py
pause
