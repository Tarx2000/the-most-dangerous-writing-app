# 🚀 Unified Antigravity Bridge Bootloader
# This script forces UTF-8 and redirects logs to bypass Windows Unicode crashes.

import os
import sys
import subprocess
import time

def boot_bridge():
    # 1. Paths
    current_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(current_dir, "litellm_config.yaml")
    log_path = os.path.join(current_dir, "litellm-service.log")
    
    # 2. Force Environment
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    
    # 3. Clean existing logs
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(f"--- Antigravity Bridge Boot @ {time.ctime()} ---\n")

    # 4. Launch LiteLLM Proxy (Detached)
    # Using 'sys.executable' ensures we use the same Python that called this bootstrapper.
    cmd = [
        sys.executable, "-m", "litellm.proxy.proxy_cli",
        "--config", config_path,
        "--port", "4000"
    ]
    
    try:
        with open(log_path, "a", encoding="utf-8") as log_file:
            process = subprocess.Popen(
                cmd,
                env=env,
                stdout=log_file,
                stderr=log_file,
                creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
            )
        print(f"✅ Bridge launched successfully (PID: {process.pid})")
    except Exception as e:
        with open(log_path, "a", encoding="utf-8") as log_file:
            log_file.write(f"FAILED TO BOOT: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    boot_bridge()
