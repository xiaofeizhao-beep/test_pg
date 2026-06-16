"""
Open portal-dev.unitpulse.ai with Google SSO login via playwright-cli.

Outputs JSON to stdout for programmatic consumption.
All progress/diagnostic messages go to stderr.

Requirements: playwright-cli installed globally (npm install -g @playwright/cli)
"""
import json
import subprocess
import sys
import time
import os

# Paths — adjust if your Node.js lives elsewhere
NODE = os.environ.get("NODE_PATH", "D:/node.js/node")
CLI = "C:/Users/xuqin/AppData/Roaming/npm/node_modules/@playwright/cli/playwright-cli.js"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
AUTH_FILE = os.path.join(os.path.dirname(__file__), "auth_state.json")
URL = "https://portal-dev.unitpulse.ai/messages/prospects"

LOGIN_TIMEOUT = int(os.environ.get("LOGIN_TIMEOUT", "180"))
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))


def log(msg: str):
    """Write diagnostic message to stderr (not mixed with JSON stdout)."""
    print(f"[open-portal] {msg}", file=sys.stderr)


def emit(obj: dict):
    """Output a JSON line to stdout."""
    print(json.dumps(obj, ensure_ascii=False))


def run(*args: str) -> str:
    """Run a playwright-cli command. Returns combined output; errors go to stderr."""
    cmd = [NODE, CLI, *args]
    log(f"$ playwright-cli {' '.join(args)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120,
                            encoding="utf-8", errors="replace")
    out = (result.stdout or "") + (result.stderr or "")
    if result.returncode != 0:
        log(f"exit={result.returncode}")
    return out


def exec_eval(expr: str) -> str:
    """Run playwright-cli eval with --raw and return trimmed result."""
    out = run("--raw", "eval", expr)
    val = out.strip()
    # playwright-cli --raw JSON-encodes string results (wrapped in quotes)
    if val.startswith('"') and val.endswith('"'):
        try:
            val = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            val = val[1:-1]
    return val


def main():
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    email = sys.argv[1] if len(sys.argv) > 1 else ""
    password = sys.argv[2] if len(sys.argv) > 2 else ""

    # ── Step 1: Open ─────────────────────────────────────────────
    log("Opening portal...")
    out = run("open", URL)
    page_url = exec_eval("window.location.href")
    page_title = exec_eval("document.title")
    log(f"Page: {page_url}")

    emit({
        "step": 1,
        "action": "open",
        "url": page_url,
        "title": page_title,
    })

    time.sleep(3)

    # ── Step 2: Snapshot & detect state ───────────────────────────
    log("Taking snapshot...")
    out = run("snapshot")

    state = "unknown"
    google_button_ref = None

    if "Continue with Google" in out:
        state = "portal_login"
        # Extract the ref for "Continue with Google" button
        for line in out.split("\n"):
            if "Continue with Google" in line and "[ref=" in line:
                ref = line.split("[ref=")[1].split("]")[0]
                google_button_ref = ref
                break

        emit({
            "step": 2,
            "action": "snapshot",
            "state": state,
            "google_button_ref": google_button_ref,
        })

        if google_button_ref:
            log(f"Clicking '{google_button_ref}' -> Google SSO")
            run("click", google_button_ref)
            time.sleep(3)

            page_url = exec_eval("window.location.href")
            page_title = exec_eval("document.title")

            emit({
                "step": 3,
                "action": "click_google_sso",
                "url": page_url,
                "title": page_title,
                "on_google": "accounts.google.com" in page_url,
            })

    elif "accounts.google.com" in out:
        state = "google_login"

        emit({
            "step": 2,
            "action": "snapshot",
            "state": state,
            "url": page_url,
        })

    else:
        state = "unexpected"

        emit({
            "step": 2,
            "action": "snapshot",
            "state": state,
            "url": page_url,
            "body_preview": out[:1000],
        })

    # ── Step 3: Auto-fill if credentials provided ─────────────────
    if state in ("portal_login", "google_login") and email:
        log(f"Auto-filling email: {email}")
        run("fill", "e28", email, "--submit")
        time.sleep(3)

        if password:
            # After email submit, Google shows password field (also indexed e28 in most flows)
            log("Auto-filling password...")
            run("fill", "e28", password, "--submit")

        page_url = exec_eval("window.location.href")
        emit({
            "step": "fill_credentials",
            "action": "fill_credentials",
            "email_provided": True,
            "password_provided": bool(password),
            "url": page_url,
            "on_portal": "portal-dev.unitpulse.ai" in page_url,
        })

    # ── Step 4: Wait for redirect ─────────────────────────────────
    log(f"Waiting for login redirect (max {LOGIN_TIMEOUT}s)...")
    iterations = LOGIN_TIMEOUT // POLL_INTERVAL
    logged_in = False
    final_url = page_url

    for i in range(iterations):
        time.sleep(POLL_INTERVAL)
        try:
            current = exec_eval("window.location.href")
            final_url = current
            log(f"  [{i * POLL_INTERVAL}s] {current}")

            if "portal-dev.unitpulse.ai" in current and "login" not in current.lower():
                logged_in = True
                break
        except Exception:
            pass

    emit({
        "step": 4,
        "action": "wait_login",
        "logged_in": logged_in,
        "url": final_url,
        "title": exec_eval("document.title"),
        "timeout": not logged_in,
    })

    # ── Step 5: Screenshot ────────────────────────────────────────
    log("Taking final screenshot...")
    screenshot_path = os.path.join(SCREENSHOT_DIR, "final.png")
    run("screenshot", f"--filename={screenshot_path}")

    emit({
        "step": 5,
        "action": "screenshot",
        "path": screenshot_path,
        "exists": os.path.exists(screenshot_path),
    })

    # ── Step 6: Save auth state ───────────────────────────────────
    log("Saving auth state...")
    run("state-save", AUTH_FILE)

    emit({
        "step": 6,
        "action": "save_auth",
        "path": AUTH_FILE,
        "exists": os.path.exists(AUTH_FILE),
    })

    # ── Done ──────────────────────────────────────────────────────
    emit({
        "step": "done",
        "success": logged_in,
        "final_url": final_url,
    })

    log("Done.")


if __name__ == "__main__":
    main()
