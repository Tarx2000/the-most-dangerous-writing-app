# 🚀 Claude Code + Ollama Cloud Bridge
# This script automatically starts the background bridge and launches Claude Code.

# Configuration
$MODEL_NAME = "glm-5.1:cloud"
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

# 2. 🔌 Configure Environment (Pointing to our local Bridge)
$env:ANTHROPIC_BASE_URL = "http://localhost:$BRIDGE_PORT"
$env:ANTHROPIC_AUTH_TOKEN = "ollama"

# Clear any conflicting API key from the environment (the bridge handles it)
Remove-Item Env:\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue

Write-Host "Launching Claude Code ($MODEL_NAME)..." -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Gray

# 3. 🏁 Start Claude Code
claude --model $MODEL_NAME
