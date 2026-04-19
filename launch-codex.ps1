# 🚀 Codex CLI + Ollama Cloud Bridge
# This script automatically starts the background bridge and launches Codex.

# Configuration
$MODEL_NAME = "minimax-m2.7:cloud"
$BRIDGE_PORT = 11434

# 1. 🛰️ Ensure the Bridge is running
Write-Host "Checking Ollama Cloud Bridge..." -ForegroundColor Cyan
$portCheck = Get-NetTCPConnection -LocalPort $BRIDGE_PORT -ErrorAction SilentlyContinue

if ($null -eq $portCheck) {
    Write-Host "Starting Bridge in the background..." -ForegroundColor Gray
    Start-Process node -ArgumentList ".\proxy-ollama.js" -WindowStyle Hidden
    Start-Sleep -Seconds 1
} else {
    Write-Host "Bridge is already active." -ForegroundColor Gray
}

Write-Host "Launching Codex CLI ($MODEL_NAME)..." -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Gray

# 2. 🏁 Start Codex
codex $args
