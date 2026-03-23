@echo off
echo Starting PTC Authoring Platform (HTTPS)...
cd /d "%~dp0"

:: Generate cert if missing (server does this too, but we need it before install)
if not exist cert.pem (
    echo Generating certificate...
    python server-https.py --gen-cert-only 2>nul
    if not exist cert.pem (
        echo Running server to generate certificate...
        start /b python server-https.py
        timeout /t 3 /nobreak >nul
        taskkill /f /im python.exe >nul 2>&1
    )
)

:: Install cert as trusted if not already done
if exist cert.pem (
    if not exist ".cert-installed" (
        echo.
        echo Installing certificate as trusted root...
        echo You may see a security prompt - click Yes to allow.
        echo.
        certutil -addstore -f "Root" cert.pem >nul 2>&1
        if %errorlevel% equ 0 (
            echo Certificate installed successfully - no more browser warnings.
            echo. > ".cert-installed"
        ) else (
            echo.
            echo Could not install certificate automatically.
            echo Run this script as Administrator, or install manually:
            echo   Double-click cert.pem ^> Install ^> Local Machine ^> Trusted Root CAs
            echo.
        )
    )
)

start https://localhost
python server-https.py
pause
