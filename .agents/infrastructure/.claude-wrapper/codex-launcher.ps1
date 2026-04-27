# ============================================================================
# Codex CLI + Antigravity Bridge Launcher (LiteLLM Edition)
# ============================================================================
# Launches the LiteLLM proxy bridge (if not running) and starts Codex CLI
# with a model/profile selection UI for Ollama Cloud models.
#
# WARNING: This file contains an OLLAMA_API_KEY. Keep this repository PRIVATE.
# ============================================================================

# -- Configuration ----------------------------------------------------------
$BRIDGE_PORT = 4000
$HEALTH_URL = "http://127.0.0.1:$BRIDGE_PORT/health"
$MAX_WAIT_SECONDS = 20
$env:OLLAMA_API_KEY = "363471669aed429592d02e756ecea5eb.4NXF_zIWWrmHRyVfLjKmuhZ2"
$env:TERM = "xterm-256color"
$env:FORCE_COLOR = "1"
# ---------------------------------------------------------------------------

# -- 1. Auto-detect Python --------------------------------------------------
# Finds the first available Python executable on the system PATH
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $PythonCmd) {
    $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}
if ($null -eq $PythonCmd) {
    Write-Host "[ERROR] Python not found. Install Python 3.11+ and add it to PATH." -ForegroundColor Red
    exit 1
}
$PYTHON_PATH = $PythonCmd.Source
Write-Host "[INFO] Using Python: $PYTHON_PATH" -ForegroundColor Gray

# -- 2. Ensure Bridge is Running --------------------------------------------
# Checks if LiteLLM proxy is healthy; launches it via litellm_boot.py if not
$bridgeHealthy = $false
try {
    $resp = Invoke-WebRequest -Uri $HEALTH_URL -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($resp.StatusCode -eq 200) { $bridgeHealthy = $true }
} catch {}

if (-not $bridgeHealthy) {
    Write-Host "[BOOT] Starting LiteLLM Bridge..." -ForegroundColor Cyan
    $booterPath = Join-Path $PSScriptRoot "litellm_boot.py"

    # Launch the bootloader (it has its own health checks and retry)
    & $PYTHON_PATH $booterPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Bridge failed to start. Check litellm-service.log" -ForegroundColor Red
        exit 1
    }

    # Verify bridge is actually responding after boot
    Write-Host "[WAIT] Verifying bridge connectivity..." -ForegroundColor Gray
    $elapsed = 0
    while ($elapsed -lt $MAX_WAIT_SECONDS) {
        try {
            $resp = Invoke-WebRequest -Uri $HEALTH_URL -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) { $bridgeHealthy = $true; break }
        } catch {}
        Start-Sleep -Seconds 1
        $elapsed++
    }

    if (-not $bridgeHealthy) {
        Write-Host "[ERROR] Bridge started but health check failed after ${MAX_WAIT_SECONDS}s" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[OK] Bridge is healthy on port $BRIDGE_PORT" -ForegroundColor Green

# -- 3. Model Selection UI --------------------------------------------------
# Shows an interactive menu when no CLI arguments are passed
$SelectedProfile = ""
if ($args.Count -eq 0) {
    Clear-Host
    Write-Host ""
    Write-Host "  =========================================" -ForegroundColor DarkCyan
    Write-Host "    CODEX MODEL SELECTOR" -ForegroundColor DarkCyan
    Write-Host "    Antigravity Bridge (LiteLLM)" -ForegroundColor DarkCyan
    Write-Host "  =========================================" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "  [1] Minimax (m2.7:cloud) -- High Reasoning" -ForegroundColor White
    Write-Host "  [2] GLM (5.1:cloud)      -- Fast and Creative" -ForegroundColor White
    Write-Host "  [3] Kimi (k2.6:cloud)    -- Advanced Reasoning" -ForegroundColor White
    Write-Host "  [4] Standard Codex       -- Default TUI Menu" -ForegroundColor White
    Write-Host ""

    $choice = Read-Host "  Select Model (1-4) [default: 1]"

    switch ($choice) {
        "1" { $SelectedProfile = "minimax" }
        "2" { $SelectedProfile = "glm" }
        "3" { $SelectedProfile = "kimi" }
        "4" { $SelectedProfile = "" }
        ""  { $SelectedProfile = "minimax" }  # Default
    }
}

# -- 4. Find and Launch the Real Codex CLI -----------------------------------
# Skips this wrapper script to find the actual 'codex' executable
$allCodex = Get-Command -Name codex -All -ErrorAction SilentlyContinue
$realCodex = $allCodex | Where-Object { $_.Source -notlike "*claude-wrapper*" -and $_.Source -notlike "*.claude-wrapper*" } | Select-Object -First 1

if ($SelectedProfile) {
    Write-Host "[LAUNCH] Codex with profile: $SelectedProfile" -ForegroundColor Green
    if ($realCodex) { & $realCodex.Source -p $SelectedProfile $args }
    else {
        Write-Host "[ERROR] Codex CLI not found. Install it: npm install -g @openai/codex" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[LAUNCH] Standard Codex" -ForegroundColor Green
    if ($realCodex) { & $realCodex.Source $args }
    else {
        Write-Host "[ERROR] Codex CLI not found. Install it: npm install -g @openai/codex" -ForegroundColor Red
        exit 1
    }
}
