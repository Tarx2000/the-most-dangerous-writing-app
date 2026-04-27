# ============================================================================
# Deployment Script - Antigravity Coding Agent Infrastructure
# ============================================================================
# Deploys the LiteLLM bridge, Claude Code config, and Codex CLI config
# to their correct locations in the user profile directory.
#
# Usage: Run from PowerShell (ideally as Administrator for PATH changes)
#   cd .agents\infrastructure\
#   .\deploy-infrastructure.ps1
# ============================================================================

$INFRA_ROOT = $PSScriptRoot
$USER_PROFILE = $HOME

Write-Host ""
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host "    Antigravity Infrastructure Deployer" -ForegroundColor Cyan
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host ""

# -- Step 0: Detect Python --------------------------------------------------
Write-Host "[0/5] Detecting Python..." -ForegroundColor Yellow
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $PythonCmd) {
    $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}
if ($null -eq $PythonCmd) {
    Write-Host "  ERROR: Python not found! Install Python 3.11+ and add to PATH." -ForegroundColor Red
    exit 1
}
$pySource = $PythonCmd.Source
Write-Host "  OK: Found $pySource" -ForegroundColor Green

# -- Step 1: Install LiteLLM ------------------------------------------------
Write-Host "[1/5] Checking LiteLLM installation..." -ForegroundColor Yellow
$litellmCheck = & $pySource -m pip show litellm 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing LiteLLM..." -ForegroundColor Gray
    & $pySource -m pip install "litellm[proxy]" --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Failed to install litellm" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: LiteLLM installed" -ForegroundColor Green
} else {
    Write-Host "  OK: LiteLLM already installed" -ForegroundColor Green
}

# -- Step 2: Deploy .claude-wrapper -----------------------------------------
Write-Host "[2/5] Deploying .claude-wrapper..." -ForegroundColor Yellow
$targetWrapper = Join-Path $USER_PROFILE ".claude-wrapper"

# Back up existing wrapper if present
if (Test-Path $targetWrapper) {
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "${targetWrapper}.bak.${ts}"
    Copy-Item -Path $targetWrapper -Destination $backupPath -Recurse -Force
    Write-Host "  Backed up existing to: $backupPath" -ForegroundColor Gray
}

if (-not (Test-Path $targetWrapper)) {
    New-Item -ItemType Directory -Path $targetWrapper | Out-Null
}
Copy-Item -Path (Join-Path $INFRA_ROOT ".claude-wrapper\*") -Destination $targetWrapper -Force
Write-Host "  OK: Copied scripts to $targetWrapper" -ForegroundColor Green

# -- Step 3: Deploy .codex config --------------------------------------------
Write-Host "[3/5] Deploying .codex config..." -ForegroundColor Yellow
$targetCodex = Join-Path $USER_PROFILE ".codex"
if (-not (Test-Path $targetCodex)) {
    New-Item -ItemType Directory -Path $targetCodex | Out-Null
}

# Back up existing config.toml if present
$existingToml = Join-Path $targetCodex "config.toml"
if (Test-Path $existingToml) {
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupToml = "${existingToml}.bak.${ts}"
    Copy-Item -Path $existingToml -Destination $backupToml -Force
    Write-Host "  Backed up existing config.toml" -ForegroundColor Gray
}

Copy-Item -Path (Join-Path $INFRA_ROOT ".codex\config.toml") -Destination $targetCodex -Force

# Deploy rules
$targetCodexRules = Join-Path $targetCodex "rules"
if (-not (Test-Path $targetCodexRules)) {
    New-Item -ItemType Directory -Path $targetCodexRules -Force | Out-Null
}
Copy-Item -Path (Join-Path $INFRA_ROOT ".codex\rules\default.rules") -Destination $targetCodexRules -Force
Write-Host "  OK: Copied Codex config to $targetCodex" -ForegroundColor Green

# -- Step 4: Deploy .claude settings -----------------------------------------
Write-Host "[4/5] Deploying .claude settings..." -ForegroundColor Yellow
$targetClaude = Join-Path $USER_PROFILE ".claude"
if (-not (Test-Path $targetClaude)) {
    New-Item -ItemType Directory -Path $targetClaude | Out-Null
}

# Back up existing settings.json if present
$existingSettings = Join-Path $targetClaude "settings.json"
if (Test-Path $existingSettings) {
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupSettings = "${existingSettings}.bak.${ts}"
    Copy-Item -Path $existingSettings -Destination $backupSettings -Force
    Write-Host "  Backed up existing settings.json" -ForegroundColor Gray
}

Copy-Item -Path (Join-Path $INFRA_ROOT ".claude\settings.json") -Destination $targetClaude -Force
Write-Host "  OK: Copied Claude settings to $targetClaude" -ForegroundColor Green

# -- Step 5: Update PATH ----------------------------------------------------
Write-Host "[5/5] Updating User PATH..." -ForegroundColor Yellow
$currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$escaped = [regex]::Escape($targetWrapper)
if ($currentPath -notmatch $escaped) {
    $newPath = $targetWrapper + ";" + $currentPath
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "  OK: Added $targetWrapper to User PATH" -ForegroundColor Green
    Write-Host "  NOTE: Restart your terminal for PATH changes to take effect" -ForegroundColor Yellow
} else {
    Write-Host "  OK: PATH already includes .claude-wrapper" -ForegroundColor Green
}

# -- Summary -----------------------------------------------------------------
Write-Host ""
Write-Host "  =========================================" -ForegroundColor Green
Write-Host "    Deployment Complete!" -ForegroundColor Green
Write-Host "  =========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Deployed to:" -ForegroundColor White
Write-Host "    $targetWrapper" -ForegroundColor Gray
Write-Host "    $targetCodex" -ForegroundColor Gray
Write-Host "    $targetClaude" -ForegroundColor Gray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Open a NEW terminal (for PATH changes)" -ForegroundColor Gray
Write-Host "    2. Run 'claude' to test Claude Code bridge" -ForegroundColor Gray
Write-Host "    3. Run 'codex' to test Codex CLI bridge" -ForegroundColor Gray
Write-Host ""
