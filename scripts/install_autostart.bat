@echo off
chcp 65001 > nul
rem ============================================================
rem  MandaraLocal — Windowsログイン時に自動起動するショートカット
rem  を shell:startup フォルダに作成。
rem  サーバ停止は タスクトレイ → コマンドプロンプト or "stop_autostart.bat"
rem ============================================================
setlocal
set "PROJ=%~dp0.."
for %%I in ("%PROJ%") do set "PROJ=%%~fI"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\MandaraLocal.lnk"

if not exist "%STARTUP%" mkdir "%STARTUP%"

rem create the .lnk via PowerShell
powershell -NoProfile -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell;" ^
  "$Shortcut = $WshShell.CreateShortcut('%LNK%');" ^
  "$Shortcut.TargetPath = '%PROJ%\start_silent.vbs';" ^
  "$Shortcut.WorkingDirectory = '%PROJ%';" ^
  "$Shortcut.WindowStyle = 7;" ^
  "$Shortcut.Description = 'MandaraLocal — auto start on login';" ^
  "$Shortcut.Save()"

if exist "%LNK%" (
  echo.
  echo  [OK] 自動起動を設定しました:
  echo       %LNK%
  echo.
  echo  Windows サインイン時に MandaraLocal サーバが http://localhost:8765/ で
  echo  自動的に立ち上がります。ブラウザでそのURLを開けばいつでも利用できます。
  echo.
  echo  解除する場合は: scripts\uninstall_autostart.bat
) else (
  echo.
  echo  [失敗] 自動起動の設定ができませんでした。
)
echo.
pause
