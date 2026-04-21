# 🚀 Claude Code + Antigravity Model Selector
# This script manages the Ollama Cloud Bridge and providing a UI for switching models for Claude.

# 1. 🛰️ Ensure the Bridge is running
$BRIDGE_PORT = 11434
$portCheck = Get-NetTCPConnection -LocalPort $BRIDGE_PORT -ErrorAction SilentlyContinue

if ($null -eq $portCheck) {
    Write-Host "📡 Starting Antigravity Bridge..." -ForegroundColor Cyan
    Start-Process node -ArgumentList ".\proxy-ollama.js" -WindowStyle Hidden
    Start-Sleep -Seconds 1
}

# 2. 🎨 UI Model Selector (only if no direct args are provided)
$ModelFlag = ""
if ($args.Count -eq 0) {
    Clear-Host
    Write-Host "   ____ _                      _      " -ForegroundColor Magenta
    Write-Host "  / ___| | __ _ _   _  __| | ___  " -ForegroundColor Magenta
    Write-Host " | |   | |/ _` | | | |/ _` |/ _ \ " -ForegroundColor Magenta
    Write-Host " | |___| | (_| | |_| | (_| |  __/ " -ForegroundColor White
    Write-Host "  \____|_|\__,_|\__,_|\__,_|\___| " -ForegroundColor White
    Write-Host "                                   " -ForegroundColor White
    Write-Host "  ======================================================" -ForegroundColor Gray
    Write-Host "                🚀 CLAUDE MODEL SELECTOR" -ForegroundColor Green
    Write-Host "  ======================================================" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [1] 💎 Minimax     - (using Sonnet alias)" -ForegroundColor White
    Write-Host "  [2] 🛰️ GLM         - (using Opus alias)" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "  Select Model (1-2) [default: 1]"
    
    switch ($choice) {
        "1" { $ModelFlag = "claude-3-5-sonnet" }
        "2" { $ModelFlag = "claude-3-opus" }
        ""  { $ModelFlag = "claude-3-5-sonnet" } # Default
    }
}

# 3. 🏁 Launch Claude
if ($ModelFlag) {
    Write-Host "`n🚀 Launching Claude with $ModelFlag (Aliased to Antigravity Cloud)..." -ForegroundColor Green
    claude -m $ModelFlag $args
} else {
    claude $args
}
