# ============================================================================
# Claude Code + Antigravity Bridge Launcher (LiteLLM Edition)
# ============================================================================
# Launches the LiteLLM proxy bridge (if not running) and starts Claude Code
# with a model selection UI for Ollama Cloud models.
#
# WARNING: This file contains an OLLAMA_API_KEY. Keep this repository PRIVATE.
# ============================================================================

# -- Configuration ----------------------------------------------------------
$BRIDGE_PORT = 4000
$HEALTH_URL = "http://127.0.0.1:$BRIDGE_PORT/health"
$MAX_WAIT_SECONDS = 20
$env:OLLAMA_API_KEY = "363471669aed429592d02e756ecea5eb.4NXF_zIWWrmHRyVfLjKmuhZ2"
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:$BRIDGE_PORT"
$env:CLAUDE_CODE_BASE_URL = "http://127.0.0.1:$BRIDGE_PORT"
$env:DISABLE_NON_ESSENTIAL_MODEL_CALLS = "1"
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"
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

# -- 2. Model Selection UI --------------------------------------------------
# Shows an interactive menu when no CLI arguments are passed
$SelectedModel = "minimax-m2.7:cloud"
$modelName = "Minimax"
$ClaudeArgs = @()

if ($args.Count -eq 0) {
    Clear-Host
    Write-Host ""
    Write-Host "  =========================================" -ForegroundColor DarkCyan
    Write-Host "    CLAUDE MODEL SELECTOR" -ForegroundColor DarkCyan
    Write-Host "    Antigravity Bridge (LiteLLM)" -ForegroundColor DarkCyan
    Write-Host "  =========================================" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "  [1] Minimax (m2.7:cloud) -- High Reasoning" -ForegroundColor White
    Write-Host "  [2] GLM (5.1:cloud)      -- Fast and Creative" -ForegroundColor White
    Write-Host "  [3] Kimi (k2.6:cloud)    -- Advanced Reasoning" -ForegroundColor White
    Write-Host ""

    $choice = Read-Host "  Select Model (1-3) [default: 1]"
    if ($choice -eq "2") { $SelectedModel = "glm-5.1:cloud"; $modelName = "GLM" }
    if ($choice -eq "3") { $SelectedModel = "kimi-k2.6:cloud"; $modelName = "Kimi" }
}

# -- Apply Model Identity Injection --
$ClaudeArgs += "--append-system-prompt"
$ClaudeArgs += "You are $modelName, an advanced reasoning model."

# -- Apply MCP Profile Segregation --
if ($SelectedModel -ne "minimax-m2.7:cloud") {
    $mcpProfile = Join-Path $PSScriptRoot "mcp-profiles\mcp-strict.json"
    if (Test-Path $mcpProfile) {
        $ClaudeArgs += "--mcp-config"
        $ClaudeArgs += $mcpProfile
        Write-Host "[INFO] Applying restricted MCP profile for $SelectedModel" -ForegroundColor Gray
    }
}

# -- 3. Ensure Bridge is Running --------------------------------------------
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

# -- 4. Find and Launch the Real Claude CLI ----------------------------------
# Skips this wrapper script to find the actual 'claude' executable
$allClaude = Get-Command -Name claude -All -ErrorAction SilentlyContinue
$realClaude = $allClaude | Where-Object { $_.Source -notlike "*claude-wrapper*" -and $_.Source -notlike "*.claude-wrapper*" } | Select-Object -First 1

Write-Host "[LAUNCH] Claude Code with model: $SelectedModel" -ForegroundColor Green
if ($realClaude) {
    $sessionStart = Get-Date
    Write-Host "[INFO] Session started at $( $sessionStart.ToString('yyyy-MM-dd HH:mm:ss') )" -ForegroundColor Gray
    
    # Launch CLI with arguments
    & $realClaude.Source --model $SelectedModel $ClaudeArgs $args
    $exitCode = $LASTEXITCODE

    $sessionEnd = Get-Date
    $duration = $sessionEnd - $sessionStart
    $durationStr = "{0:mm}m{0:ss}s" -f $duration

    # Log telemetry
    $logFile = Join-Path $PSScriptRoot "claude-session.log"
    $logMsg = "[$( $sessionEnd.ToString('yyyy-MM-dd HH:mm:ss') )] Model: $SelectedModel | Duration: $durationStr | Exit: $exitCode"
    Add-Content -Path $logFile -Value $logMsg
    
    Write-Host "[INFO] Session ended. Duration: $durationStr (Exit: $exitCode)" -ForegroundColor Gray
    exit $exitCode
} else {
    Write-Host "[ERROR] Claude CLI not found. Install it: npm install -g @anthropic-ai/claude-code" -ForegroundColor Red
    exit 1
}
