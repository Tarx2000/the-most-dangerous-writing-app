# Coding Agent Infrastructure — Ollama Cloud Bridge

This folder contains the configuration and scripts for the **Antigravity Coding Agent Infrastructure**. It bridges **Claude Code** and **Codex CLI** to **Ollama Cloud** models (Minimax, GLM) via a **LiteLLM proxy**.

## ⚠️ PRIVACY WARNING

> [!CAUTION]
> **This folder contains API keys (OLLAMA_API_KEY) and sensitive configuration.**
> This repository should remain **PRIVATE**. If you intend to make this repository public, you **MUST** remove or sanitize:
> - `.claude-wrapper/claude-proxy.ps1` (contains OLLAMA_API_KEY)
> - `.claude-wrapper/codex-launcher.ps1` (contains OLLAMA_API_KEY)
> - `.claude/settings.json` (if it contains auth tokens)

## Architecture

```
┌──────────────┐     ┌──────────────┐
│ Claude Code  │     │  Codex CLI   │
│  (claude)    │     │   (codex)    │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │  OpenAI-compat API │
       ▼                    ▼
┌──────────────────────────────────┐
│     LiteLLM Proxy (port 4000)   │
│     litellm_boot.py             │
│     litellm_config.yaml         │
└──────────────┬───────────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────────┐
│       Ollama Cloud (ollama.com)  │
│   minimax-m2.7:cloud             │
│   glm-5.1:cloud                  │
│   kimi-k2.6:cloud                │
└──────────────────────────────────┘
```

## How to Set Up on a New PC

### Prerequisites
- **Python 3.11+** installed and on PATH
- **Node.js** installed
- **Claude Code CLI**: `npm install -g @anthropic-ai/claude-code`
- **Codex CLI**: `npm install -g @openai/codex`
- **WSL** (required for Codex on Windows): `wsl --install`

### Deploy

1. Open **PowerShell** (Administrator recommended for PATH changes)
2. Navigate to this directory:
   ```powershell
   cd .agents/infrastructure/
   ```
3. Run the deployment script:
   ```powershell
   .\deploy-infrastructure.ps1
   ```

The script will automatically:
- Detect your Python installation
- Install LiteLLM if missing (`pip install litellm`)
- Copy configs to `~/.claude-wrapper/`, `~/.codex/`, `~/.claude/`
- Add `~/.claude-wrapper` to your user PATH
- Back up any existing configs before overwriting

### After Deployment

1. **Restart your terminal** (for PATH changes)
2. Run `claude` → Model selector appears → Choose model → Claude Code launches through bridge
3. Run `codex` → Model selector appears → Choose profile → Codex launches through bridge

## Contents

| Path | Purpose |
|---|---|
| `.claude-wrapper/litellm_boot.py` | Python bootloader: launches LiteLLM proxy with health checks & retry |
| `.claude-wrapper/litellm_config.yaml` | LiteLLM model routing configuration |
| `.claude-wrapper/restart-bridge.ps1` | **Restart utility**: kills stale bridge, restarts, verifies models |
| `.claude-wrapper/claude-proxy.ps1` | Claude Code launcher with model selector UI |
| `.claude-wrapper/codex-launcher.ps1` | Codex CLI launcher with model/profile selector UI |
| `.claude-wrapper/claude.bat` | Batch wrapper → calls `claude-proxy.ps1` |
| `.claude-wrapper/codex.bat` | Batch wrapper → calls `codex-launcher.ps1` |
| `.claude-wrapper/code.cmd` | Passthrough to Antigravity IDE |
| `.codex/config.toml` | Codex CLI provider & profile configuration |
| `.claude/settings.json` | Claude Code environment overrides |
| `deploy-infrastructure.ps1` | Automated deployment script |

> [!WARNING]
> After editing `litellm_config.yaml` (e.g., adding a new model), you **must restart the bridge**:
> ```powershell
> restart-bridge    # or: ~/.claude-wrapper/restart-bridge.ps1
> ```
> The bridge loads the config at startup and does NOT hot-reload changes.

## Troubleshooting

- **Bridge won't start**: Check `~/.claude-wrapper/litellm-service.log`
- **Port 4000 occupied**: Run `Get-NetTCPConnection -LocalPort 4000` to find what's using it
- **Python not found**: Ensure `python` is on your system PATH
- **Model errors**: Verify your OLLAMA_API_KEY is valid and Ollama Cloud is reachable
- **"Invalid model name"**: The bridge is running with an old config. Run `restart-bridge` to reload
