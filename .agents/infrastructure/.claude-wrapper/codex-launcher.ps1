# Global Codex CLI + Antigravity Model Selector
# WARNING: This file contains an OLLAMA_API_KEY. Remove this key if moving to a public repository!
$PYTHON_PATH = "C:\Users\Tarik\AppData\Local\Programs\Python\Python311\python.exe"
$env:OLLAMA_API_KEY = "363471669aed429592d02e756ecea5eb.4NXF_zIWWrmHRyVfLjKmuhZ2"
$env:TERM = "xterm-256color"
$env:FORCE_COLOR = "1"

# 1. Ensure the Unified Bridge is running (Port 4000)
$BRIDGE_PORT = 4000
$portCheck = Get-NetTCPConnection -LocalPort $BRIDGE_PORT -ErrorAction SilentlyContinue

if ($null -eq $portCheck) {
    Write-Host "Starting Unified LiteLLM Proxy (Shielded Mode)..." -ForegroundColor Cyan
    $booterPath = Join-Path $PSScriptRoot "litellm_boot.py"
    & $PYTHON_PATH $booterPath
    Start-Sleep -Seconds 4
}

# 2. UI Model Selector (only if no direct args are provided)
$SelectedProfile = ""
if ($args.Count -eq 0) {
    Clear-Host
    Write-Host "  ======================================================" -ForegroundColor Gray
    Write-Host "             ANTIGRAVITY MODEL SELECTOR" -ForegroundColor Green
    Write-Host "  ======================================================" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  [1] Minimax (m2.7:cloud) - High Reasoning" -ForegroundColor White
    Write-Host "  [2] GLM (5.1:cloud)     - Fast & Creative" -ForegroundColor White
    Write-Host "  [3] Standard Codex      - Default TUI Menu" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "  Select Model (1-3) [default: 1]"
    
    switch ($choice) {
        "1" { $SelectedProfile = "minimax" }
        "2" { $SelectedProfile = "glm" }
        "3" { $SelectedProfile = "" }
        ""  { $SelectedProfile = "minimax" } # Default
    }
}

# 3. Find Global Codex (ignoring this wrapper)
$allCodex = Get-Command -Name codex -All -ErrorAction SilentlyContinue
$realCodex = $allCodex | Where-Object { $_.Definition -notlike "*claude-wrapper*" } | Select-Object -First 1

# 4. Launch
if ($SelectedProfile) {
    Write-Host "`nLaunching Antigravity Codex ($SelectedProfile)..." -ForegroundColor Green
    if ($realCodex) { & $realCodex.Definition -p $SelectedProfile $args }
    else { codex -p $SelectedProfile $args }
} else {
    Write-Host "`nLaunching Standard Codex..." -ForegroundColor Green
    if ($realCodex) { & $realCodex.Definition $args }
    else { codex $args }
}
