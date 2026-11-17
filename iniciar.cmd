@echo off
cd /d "%~dp0"
start "" http://localhost:3847
node --watch server.mjs
pause
