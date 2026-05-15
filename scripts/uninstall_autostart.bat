@echo off
chcp 65001 > nul
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MandaraLocal.lnk"
if exist "%LNK%" (
  del "%LNK%"
  echo [OK] 自動起動を解除しました。
) else (
  echo [情報] 自動起動は設定されていませんでした。
)
pause
