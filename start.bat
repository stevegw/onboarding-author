@echo off
echo Starting PTC Authoring Platform...
cd /d "%~dp0"
start http://localhost:8060
python server.py
pause
