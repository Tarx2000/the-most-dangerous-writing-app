# ============================================================================
# Bridge Restart Utility
# ============================================================================
# Kills any existing LiteLLM bridge process, clears stale PID files,
# restarts the bridge with the current config, and verifies it's healthy.
#
# Usage:
#   .\restart-bridge.ps1          # From the .claude-wrapper directory
#   restart-bridge                # If .claude-wrapper is on PATH
#
# Run this after changing litellm_config.yaml to pick up new models.
# ============================================================================

# -- Configuration ----------------------------------------------------------
$BRIDGE_PORT = 4000
$HEALTH_URL = "http://127.0.0.1:$BRIDGE_PORT/health/readiness"
$MODELS_URL = "http://127.0.0.1:$BRIDGE_PORT/v1/models"
$MAX_WAIT_SECONDS = 20
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "    Bridge Restart Utility" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Find and kill existing bridge process --------------------------------
Write-Host "[1/4] Stopping existing bridge..." -ForegroundColor Yellow
$portConn = Get-NetTCPConnection -LocalPort $BRIDGE_PORT -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portConn) {
    $procId = $portConn.OwningProcess
    $procName = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    Write-Host "  Found process: $procName (PID: $procId)" -ForegroundColor Gray
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Host "  OK: Process stopped" -ForegroundColor Green
} else {
    Write-Host "  OK: Port $BRIDGE_PORT is already free" -ForegroundColor Green
}

# -- 2. Clear stale PID file -------------------------------------------------
$pidFile = Join-Path $PSScriptRoot "litellm-bridge.pid"
if (Test-Path $pidFile) {
    Remove-Item $pidFile -Force
    Write-Host "  OK: Removed stale PID file" -ForegroundColor Green
}

# -- 3. Restart the bridge ----------------------------------------------------
Write-Host "[2/4] Starting fresh bridge..." -ForegroundColor Yellow

# Auto-detect Python
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $PythonCmd) { $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue }
if ($null -eq $PythonCmd) {
    Write-Host "  ERROR: Python not found!" -ForegroundColor Red
    exit 1
}

# Ensure OLLAMA_API_KEY is set (read from claude-proxy.ps1 if needed)
if (-not $env:OLLAMA_API_KEY) {
    $proxyScript = Join-Path $PSScriptRoot "claude-proxy.ps1"
    if (Test-Path $proxyScript) {
        $keyLine = Get-Content $proxyScript | Select-String 'OLLAMA_API_KEY\s*=' | Select-Object -First 1
        if ($keyLine -match '"([^"]+)"') {
            $env:OLLAMA_API_KEY = $Matches[1]
            Write-Host "  OK: Loaded API key from claude-proxy.ps1" -ForegroundColor Gray
        }
    }
}

$booterPath = Join-Path $PSScriptRoot "litellm_boot.py"
& $PythonCmd.Source $booterPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Bridge failed to start. Check litellm-service.log" -ForegroundColor Red
    exit 1
}

# -- 4. Wait for health check ------------------------------------------------
Write-Host "[3/4] Waiting for bridge to become healthy..." -ForegroundColor Yellow
$bridgeHealthy = $false
$elapsed = 0
while ($elapsed -lt $MAX_WAIT_SECONDS) {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $HEALTH_URL -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -eq 200) { $bridgeHealthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
    $elapsed++
}

if (-not $bridgeHealthy) {
    Write-Host "  ERROR: Bridge health check failed after ${MAX_WAIT_SECONDS}s" -ForegroundColor Red
    exit 1
}
Write-Host "  OK: Bridge is healthy on port $BRIDGE_PORT" -ForegroundColor Green

# -- 5. List available models -------------------------------------------------
Write-Host "[4/4] Available models:" -ForegroundColor Yellow
try {
    $models = Invoke-RestMethod -Uri $MODELS_URL -TimeoutSec 5
    foreach ($m in $models.data) {
        Write-Host "  [OK] $($m.id)" -ForegroundColor Green
    }
} catch {
    Write-Host "  WARNING: Could not list models" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host "    Bridge restarted successfully!" -ForegroundColor Green
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host ""
