# Global Claude Code + Antigravity Model Selector (LiteLLM Bootloader Edition)
# WARNING: This file contains an OLLAMA_API_KEY. Remove this key if moving to a public repository!
$PYTHON_PATH = "C:\Users\Tarik\AppData\Local\Programs\Python\Python311\python.exe"
$env:OLLAMA_API_KEY = "363471669aed429592d02e756ecea5eb.4NXF_zIWWrmHRyVfLjKmuhZ2"

# Base URL Pointing to our local Bridge on Port 4000
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:4000/v1"
$env:CLAUDE_CODE_BASE_URL = "http://127.0.0.1:4000/v1"

# 1. Selection UI
$SelectedModel = "minimax-m2.7:cloud"
if ($args.Count -eq 0) {
    Clear-Host
    Write-Host "======================================================"
    Write-Host "            CLAUDE MODEL SELECTOR (LiteLLM)"
    Write-Host "======================================================"
    Write-Host ""
    Write-Host "[1] Minimax (m2.7:cloud)"
    Write-Host "[2] GLM (5.1:cloud)"
    Write-Host ""
    
    $choice = Read-Host "Select Model (1-2) [default: 1]"
    if ($choice -eq "2") { $SelectedModel = "glm-5.1:cloud" }
}

# 2. Ensure Unified Bridge is up via Python Bootloader
$BRIDGE_PORT = 4000
$portCheck = Get-NetTCPConnection -LocalPort $BRIDGE_PORT -ErrorAction SilentlyContinue

if ($null -eq $portCheck) {
    Write-Host "Starting Unified LiteLLM Proxy (Shielded Mode)..."
    $booterPath = Join-Path $PSScriptRoot "litellm_boot.py"
    # Launching the booter synchronously allows it to report success/fail before we continue
    & $PYTHON_PATH $booterPath
    Start-Sleep -Seconds 4
}

# 3. Find and Launch Claude
$allClaude = Get-Command -Name claude -All -ErrorAction SilentlyContinue
$realClaude = $allClaude | Where-Object { $_.Definition -notlike "*claude-wrapper*" } | Select-Object -First 1

Write-Host "Launching Claude..."
if ($realClaude) { & $realClaude.Definition --model $SelectedModel $args }
else { claude --model $SelectedModel $args }
