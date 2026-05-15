@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo === MandaraLocal — GitHub Pages 公開ヘルパー ===
echo.
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Gitがインストールされていません。https://git-scm.com/download/win から入れてください。
  pause
  exit /b 1
)

git remote -v >nul 2>&1
git remote get-url origin >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo すでにリモートが設定されています:
  git remote -v
  echo.
  echo push します...
  git push -u origin main
  goto done
)

echo まずGitHubで新しい Public リポジトリを作ってください (空のままでOK)：
echo   https://github.com/new
echo.
set /p USER="あなたのGitHubユーザー名を入力: "
if "%USER%"=="" goto cancel
set /p REPO="リポジトリ名 (デフォルト: MandaraLocal) ["
if "%REPO%"=="" set REPO=MandaraLocal

set URL=https://github.com/%USER%/%REPO%.git
echo.
echo リモート: %URL%
git remote add origin %URL%
echo.
echo 初回 push（ブラウザ認証が開きます）…
git push -u origin main

echo.
echo === 完了 ===
echo 公開URL: https://%USER%.github.io/%REPO%/
echo.
echo 次の手順: リポジトリの Settings → Pages → Source を "GitHub Actions" に変更
echo Actionsタブでデプロイ進捗を確認できます。
goto done

:cancel
echo キャンセルしました。

:done
echo.
pause
