# ============================================================================
# Unified Antigravity Bridge Bootloader
# ============================================================================
# Launches the LiteLLM proxy server that bridges Claude Code and Codex CLI
# to Ollama Cloud models (Minimax, GLM). Includes health checks, retry logic,
# and PID tracking to ensure reliable startup on Windows.
#
# LiteLLM = A Python proxy that translates OpenAI-compatible API calls to
#           100+ LLM providers. We use it to route requests to Ollama Cloud.
# ============================================================================

import os
import sys
import subprocess
import time
import socket
import urllib.request

# -- Configuration ----------------------------------------------------------
BRIDGE_PORT = 4000                  # Port the LiteLLM proxy listens on
HEALTH_CHECK_URL = "http://127.0.0.1:{}/health/readiness".format(BRIDGE_PORT)
MAX_BOOT_RETRIES = 3                # Number of times to retry launching
HEALTH_CHECK_INTERVAL = 1.0         # Seconds between health checks
HEALTH_CHECK_TIMEOUT = 15           # Max seconds to wait for proxy to be ready
PID_FILENAME = "litellm-bridge.pid" # PID file to track running process
LOG_FILENAME = "litellm-service.log"
# ---------------------------------------------------------------------------


def get_paths():
    """Resolve all file paths relative to this script's directory."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    return {
        "config": os.path.join(current_dir, "litellm_config.yaml"),
        "log": os.path.join(current_dir, LOG_FILENAME),
        "pid": os.path.join(current_dir, PID_FILENAME),
    }


def is_port_open(port):
    """Check if something is already listening on the given port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def is_bridge_healthy():
    """Send a GET request to the LiteLLM health endpoint."""
    try:
        req = urllib.request.Request(HEALTH_CHECK_URL, method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def read_existing_pid(pid_path):
    """Read PID from file and check if the process is still running."""
    if not os.path.exists(pid_path):
        return None
    try:
        with open(pid_path, "r") as f:
            pid = int(f.read().strip())
        # Check if process with this PID exists (Windows-compatible)
        os.kill(pid, 0)
        return pid
    except (ValueError, OSError, ProcessLookupError):
        # PID file is stale -- process no longer running
        try:
            os.remove(pid_path)
        except OSError:
            pass
        return None


def write_pid(pid_path, pid):
    """Write PID to file for future tracking."""
    with open(pid_path, "w") as f:
        f.write(str(pid))


def wait_for_health(timeout=HEALTH_CHECK_TIMEOUT):
    """Poll the health endpoint until proxy is ready or timeout expires."""
    start = time.time()
    while time.time() - start < timeout:
        if is_bridge_healthy():
            return True
        time.sleep(HEALTH_CHECK_INTERVAL)
    return False


def launch_proxy(paths, env):
    """Launch the LiteLLM proxy as a detached background process."""
    cmd = [
        sys.executable, "-m", "litellm.proxy.proxy_cli",
        "--config", paths["config"],
        "--port", str(BRIDGE_PORT),
    ]

    with open(paths["log"], "a", encoding="utf-8") as log_file:
        log_file.write("\n--- Boot attempt @ {} ---\n".format(time.ctime()))
        log_file.write("Command: {}\n".format(" ".join(cmd)))
        log_file.write("Python: {} ({})\n".format(sys.executable, sys.version))

        process = subprocess.Popen(
            cmd,
            env=env,
            stdout=log_file,
            stderr=log_file,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
        )

    return process


def boot_bridge():
    """Main entry point: launch and verify the LiteLLM bridge proxy."""
    paths = get_paths()

    # -- 1. Check if bridge is already running --
    existing_pid = read_existing_pid(paths["pid"])
    if existing_pid and is_bridge_healthy():
        print("[OK] Bridge already running (PID: {})".format(existing_pid))
        return

    # -- 2. Check if port is occupied by something else --
    if is_port_open(BRIDGE_PORT) and not is_bridge_healthy():
        print("[ERROR] Port {} is in use but NOT by our bridge. Check for conflicts.".format(BRIDGE_PORT))
        sys.exit(1)

    # -- 3. Prepare environment --
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"

    # Initialize log file
    with open(paths["log"], "w", encoding="utf-8") as f:
        f.write("--- Antigravity Bridge Boot @ {} ---\n".format(time.ctime()))
        f.write("Python: {} ({})\n".format(sys.executable, sys.version))
        f.write("Config: {}\n\n".format(paths["config"]))

    # -- 4. Launch with retry logic --
    for attempt in range(1, MAX_BOOT_RETRIES + 1):
        print("[BOOT] Starting LiteLLM Bridge (attempt {}/{})...".format(attempt, MAX_BOOT_RETRIES))

        try:
            process = launch_proxy(paths, env)
        except FileNotFoundError:
            print("[ERROR] Python executable not found: {}".format(sys.executable))
            sys.exit(1)
        except Exception as e:
            print("[ERROR] Failed to launch process: {}".format(e))
            with open(paths["log"], "a", encoding="utf-8") as f:
                f.write("LAUNCH ERROR (attempt {}): {}\n".format(attempt, e))
            if attempt == MAX_BOOT_RETRIES:
                sys.exit(1)
            continue

        # -- 5. Wait for health check --
        print("[WAIT] Waiting for bridge to become healthy (up to {}s)...".format(HEALTH_CHECK_TIMEOUT))
        if wait_for_health():
            write_pid(paths["pid"], process.pid)
            print("[OK] Bridge launched successfully (PID: {}, Port: {})".format(process.pid, BRIDGE_PORT))
            return
        else:
            # Check if process died
            if process.poll() is not None:
                print("[WARN] Bridge process exited with code {}".format(process.returncode))
                with open(paths["log"], "a", encoding="utf-8") as f:
                    f.write("Process exited with code {} on attempt {}\n".format(process.returncode, attempt))
            else:
                print("[WARN] Bridge process is running but health check failed")

            if attempt == MAX_BOOT_RETRIES:
                print("[ERROR] Bridge failed to start after {} attempts.".format(MAX_BOOT_RETRIES))
                print("  Check logs: {}".format(paths["log"]))
                sys.exit(1)

            print("  Retrying in 2s...")
            time.sleep(2)


if __name__ == "__main__":
    boot_bridge()
