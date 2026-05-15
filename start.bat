@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo === MandaraNext 起動 ===
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  where py >nul 2>&1
  if %ERRORLEVEL% NEQ 0 (
    echo Pythonが見つかりません。https://www.python.org/ からインストールしてください。
    pause
    exit /b 1
  )
  py scripts\serve.py %*
) else (
  python scripts\serve.py %*
)
