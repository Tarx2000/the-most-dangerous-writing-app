# Coding Agent Infrastructure Backup

This folder contains the configuration and scripts for the **Antigravity Coding Agent Infrastructure**, including Claude Code, Codex, and the LiteLLM Proxy Bridge.

## ⚠️ PRIVACY WARNING

> [!CAUTION]
> **This folder contains API keys (OLLAMA_API_KEY) and sensitive configuration.**
> This repository should remain **PRIVATE**. If you intend to make this repository public in the future, you **MUST** remove or sanitize the following files:
> - `.claude-wrapper/claude-proxy.ps1`
> - `.claude-wrapper/codex-launcher.ps1`
> - `.claude/settings.json` (if it contains auth tokens)

## How to Set Up on a New PC

1. **Prerequisites**:
   - Python 3.11+ installed.
   - LiteLLM installed (`pip install litellm`).
   - Node.js and the `claude` (Claude Code) and `codex` (Codex CLI) packages installed globally.

2. **Deploy Configuration**:
   - Open PowerShell as Administrator.
   - Navigate to this directory: `cd .agents/infrastructure/`
   - Run the deployment script: `.\deploy-infrastructure.ps1`
   - This will copy all files to your user profile directory (`~/.claude-wrapper`, `~/.codex`, and `~/.claude`).

3. **Check Python Paths**:
   - Open `~/.claude-wrapper/claude-proxy.ps1` and `~/.claude-wrapper/codex-launcher.ps1`.
   - Ensure `$PYTHON_PATH` points to the correct `python.exe` on the new machine.

4. **Update System PATH**:
   - Add `C:\Users\<YourUser>\.claude-wrapper` to your system's Environment Variables `PATH` so you can call `claude` and `codex` from anywhere.

## Contents

- `.claude-wrapper/`: Custom PowerShell and Python scripts to bridge Claude Code and Codex to LiteLLM.
- `.codex/`: Configuration and custom rules for the Codex CLI.
- `.claude/`: Environment settings and model overrides for Claude Code.
- `deploy-infrastructure.ps1`: Automated deployment script.
