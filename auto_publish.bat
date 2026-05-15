@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ============================================================
echo  MandaraLocal - GitHub Pages auto publisher
echo ============================================================
echo.

set "GH=C:\Program Files\GitHub CLI\gh.exe"
if not exist "%GH%" (
  echo gh CLI not found. Run: winget install --id GitHub.cli
  pause
  exit /b 1
)

rem ---- 1. authenticate ----
"%GH%" auth status >nul 2>&1
if not %ERRORLEVEL%==0 (
  echo [1/4] Logging in to GitHub. Browser will open.
  echo       Click "Authorize github" and the rest is automatic.
  echo.
  "%GH%" auth login --hostname github.com --web --git-protocol https --scopes "repo,workflow"
  if not %ERRORLEVEL%==0 goto fail
) else (
  echo [1/4] Already authenticated.
)

rem ---- 2. detect username ----
for /f "tokens=*" %%i in ('""%GH%" api user --jq .login"') do set "GHUSER=%%i"
if "%GHUSER%"=="" goto fail
echo [2/4] GitHub user: %GHUSER%

rem ---- 3. create or reuse repo, then push ----
echo [3/4] Creating repository and pushing...
"%GH%" repo view "%GHUSER%/MandaraLocal" >nul 2>&1
if not %ERRORLEVEL%==0 (
  "%GH%" repo create MandaraLocal --public --source=. --remote=origin --push
  if not %ERRORLEVEL%==0 goto fail
) else (
  echo       Existing repo - pushing latest commits...
  git remote get-url origin >nul 2>&1
  if not %ERRORLEVEL%==0 git remote add origin "https://github.com/%GHUSER%/MandaraLocal.git"
  git push -u origin main
  if not %ERRORLEVEL%==0 goto fail
)

rem ---- 4. enable Pages with Actions source ----
echo [4/4] Enabling GitHub Pages (Actions source)...
"%GH%" api -X POST "repos/%GHUSER%/MandaraLocal/pages" -f "build_type=workflow" >nul 2>&1
if not %ERRORLEVEL%==0 (
  "%GH%" api -X PUT "repos/%GHUSER%/MandaraLocal/pages" -f "build_type=workflow" >nul 2>&1
)

echo.
echo ============================================================
echo  DONE!  Site will be live in 1-2 minutes:
echo.
echo    https://%GHUSER%.github.io/MandaraLocal/
echo.
echo  Actions:  https://github.com/%GHUSER%/MandaraLocal/actions
echo ============================================================
pause
exit /b 0

:fail
echo.
echo Failed. See messages above. Re-run after fixing.
pause
exit /b 1
