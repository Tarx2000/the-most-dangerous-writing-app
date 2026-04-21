# 🚀 Codex CLI + Antigravity Model Selector
# This script manages the Ollama Cloud Bridge and provides a UI for switching models.

# 1. 🛰️ Ensure the Bridge is running
$BRIDGE_PORT = 11434
$portCheck = Get-NetTCPConnection -LocalPort $BRIDGE_PORT -ErrorAction SilentlyContinue

if ($null -eq $portCheck) {
    Write-Host "📡 Starting Antigravity Bridge..." -ForegroundColor Cyan
    Start-Process node -ArgumentList ".\proxy-ollama.js" -WindowStyle Hidden
    Start-Sleep -Seconds 1
}

# 2. 🎨 UI Model Selector (only if no direct args are provided)
$SelectedProfile = ""
if ($args.Count -eq 0) {
    Clear-Host
    $ascii = @'
      _         _   _                      _ _         
     / \   _ __| |_(_) __ _ _ __ __ ___   (_) |_ _   _ 
    / _ \ | '__| __| |/ _` | '__/ _` \ \ / / | __| | | |
   / ___ \| |  | |_| | (_| | | | (_| |\ V /| | |_| |_| |
  /_/   \_\_|   \__|_|\__, |_|  \__,_| \_/ |_|\__|\__, |
                      |___/                       |___/ 
'@
    Write-Host $ascii -ForegroundColor Cyan
    Write-Host "  ======================================================" -ForegroundColor Gray
    Write-Host "                   🚀 MODEL SELECTOR" -ForegroundColor Green
    Write-Host "  ======================================================" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [1] 💎 Minimax (m2.7:cloud) - High Reasoning" -ForegroundColor White
    Write-Host "  [2] 🛰️ GLM (5.1:cloud)     - Fast & Creative" -ForegroundColor White
    Write-Host "  [3] 🌌 Standard Codex      - Default TUI Menu" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "  Select Model (1-3) [default: 1]"
    
    switch ($choice) {
        "1" { $SelectedProfile = "minimax" }
        "2" { $SelectedProfile = "glm" }
        "3" { $SelectedProfile = "" }
        ""  { $SelectedProfile = "minimax" } # Default
    }
}

# 3. 🏁 Launch Codex
if ($SelectedProfile) {
    Write-Host "`n🚀 Launching Antigravity Codex with Profile: $SelectedProfile..." -ForegroundColor Green
    codex -p $SelectedProfile $args
} else {
    Write-Host "`n🚀 Launching Standard Codex..." -ForegroundColor Green
    codex $args
}
