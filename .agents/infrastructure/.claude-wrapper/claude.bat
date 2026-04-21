@echo off
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0claude-proxy.ps1" %*
