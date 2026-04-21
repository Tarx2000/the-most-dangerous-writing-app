# Deployment Script for Coding Agent Infrastructure
# This script copies the configuration files to their respective locations in your user profile.

$INFRA_ROOT = $PSScriptRoot
$USER_PROFILE = $HOME

Write-Host "Deploying Coding Agent Infrastructure..." -ForegroundColor Cyan

# 1. .claude-wrapper
$targetWrapper = Join-Path $USER_PROFILE ".claude-wrapper"
if (-not (Test-Path $targetWrapper)) {
    New-Item -ItemType Directory -Path $targetWrapper | Out-Null
    Write-Host "Created $targetWrapper" -ForegroundColor Gray
}
Copy-Item -Path (Join-Path $INFRA_ROOT ".claude-wrapper\*") -Destination $targetWrapper -Force
Write-Host "Copied scripts to $targetWrapper" -ForegroundColor Green

# 2. .codex
$targetCodex = Join-Path $USER_PROFILE ".codex"
$targetCodexRules = Join-Path $targetCodex "rules"
if (-not (Test-Path $targetCodexRules)) {
    New-Item -ItemType Directory -Path $targetCodexRules -Force | Out-Null
    Write-Host "Created $targetCodexRules" -ForegroundColor Gray
}
Copy-Item -Path (Join-Path $INFRA_ROOT ".codex\config.toml") -Destination $targetCodex -Force
Copy-Item -Path (Join-Path $INFRA_ROOT ".codex\rules\default.rules") -Destination $targetCodexRules -Force
Write-Host "Copied Codex config to $targetCodex" -ForegroundColor Green

# 3. .claude
$targetClaude = Join-Path $USER_PROFILE ".claude"
if (-not (Test-Path $targetClaude)) {
    New-Item -ItemType Directory -Path $targetClaude | Out-Null
    Write-Host "Created $targetClaude" -ForegroundColor Gray
}
Copy-Item -Path (Join-Path $INFRA_ROOT ".claude\settings.json") -Destination $targetClaude -Force
Write-Host "Copied Claude settings to $targetClaude" -ForegroundColor Green

Write-Host "`nDeployment complete!" -ForegroundColor Cyan
Write-Host "NOTE: Ensure Python and LiteLLM are installed on this machine." -ForegroundColor Yellow
Write-Host "NOTE: Check the Python path in .claude-wrapper\claude-proxy.ps1 and codex-launcher.ps1 if they differ from the original machine." -ForegroundColor Yellow
Write-Host "NOTE: To use the scripts, add $targetWrapper to your system PATH." -ForegroundColor Cyan
