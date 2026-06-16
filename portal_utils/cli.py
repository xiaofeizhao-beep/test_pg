"""
playwright-cli 封装层。

提供对 playwright-cli 命令行工具的 Python 封装，包括路径解析、
命令执行、异常处理、无头模式配置。
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class CliError(Exception):
    """Base exception for playwright-cli related errors."""


class CliTimeoutError(CliError):
    """Raised when a playwright-cli command exceeds its timeout."""


class CliCommandError(CliError):
    """Raised when a playwright-cli command returns a non-zero exit code."""


class CliNotFoundError(CliError):
    """Raised when node or playwright-cli cannot be found."""


# ---------------------------------------------------------------------------
# Module state — resolved at import time
# ---------------------------------------------------------------------------

_NODE_EXE: str = ""
_CLI_JS: str = ""


# ---------------------------------------------------------------------------
# Headless config
# ---------------------------------------------------------------------------

_HEADLESS_CONFIG_PATH: Optional[str] = None


def _generate_headless_config() -> str:
    """Write a temporary playwright.config.json with headless:true and return its path."""
    fd, path = tempfile.mkstemp(suffix=".json", prefix="playwright-headless-")
    config = {
        "use": {
            "headless": True,
            "channel": "chrome",
        },
    }
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(config, f)
    return path


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

def _try_npm_root() -> Optional[str]:
    """Run `npm root -g` to get the global node_modules directory."""
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        return None
    try:
        result = subprocess.run(
            [npm, "root", "-g"],
            capture_output=True, text=True, timeout=15,
            encoding="utf-8", errors="replace",
        )
        if result.returncode == 0:
            val = result.stdout.strip()
            if val and os.path.isdir(val):
                return val
    except Exception:
        pass
    return None


def resolve_paths() -> Tuple[str, str]:
    """自动发现 Node.js 和 playwright-cli 的路径。

    Returns (node_exe, cli_js).

    Node.js 优先级:
      1. NODE_PATH 环境变量
      2. shutil.which("node") / shutil.which("node.exe")
      3. 常见 Windows 安装路径

    playwright-cli 优先级:
      1. PLAYWRIGHT_CLI_PATH 环境变量
      2. <npm root -g>/@playwright/cli/playwright-cli.js
      3. %APPDATA%/npm/node_modules/@playwright/cli/playwright-cli.js
    """
    errors: List[str] = []
    tried_node: List[str] = []

    # --- Node.js ---
    node_exe = ""

    node_env = os.environ.get("NODE_PATH", "")
    if node_env and os.path.isfile(node_env):
        node_exe = node_env
    tried_node.append(node_env)

    if not node_exe:
        for name in ("node", "node.exe"):
            found = shutil.which(name)
            if found and os.path.isfile(found):
                node_exe = found
                break
            if found:
                tried_node.append(found)

    if not node_exe:
        candidates = [
            "D:/node.js/node.exe",
            "D:/node.js/node",
            "C:/Program Files/nodejs/node.exe",
            "C:/Program Files (x86)/nodejs/node.exe",
        ]
        for c in candidates:
            tried_node.append(c)
            if os.path.isfile(c):
                node_exe = c
                break

    if not node_exe:
        errors.append(
            f"Node.js not found. Tried: {', '.join(filter(None, tried_node))}. "
            "Set NODE_PATH env var."
        )

    # --- playwright-cli ---
    cli_js = ""
    tried_cli: List[str] = []

    cli_env = os.environ.get("PLAYWRIGHT_CLI_PATH", "")
    if cli_env and os.path.isfile(cli_env):
        cli_js = cli_env
    tried_cli.append(cli_env)

    if not cli_js:
        npm_root = _try_npm_root()
        if npm_root:
            candidate = os.path.join(npm_root, "@playwright", "cli", "playwright-cli.js")
            tried_cli.append(candidate)
            if os.path.isfile(candidate):
                cli_js = candidate

    if not cli_js:
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            candidate = os.path.join(
                appdata, "npm", "node_modules",
                "@playwright", "cli", "playwright-cli.js",
            )
            tried_cli.append(candidate)
            if os.path.isfile(candidate):
                cli_js = candidate

    if not cli_js:
        errors.append(
            f"playwright-cli not found. Tried: {', '.join(filter(None, tried_cli))}. "
            "Install: npm install -g @playwright/cli or set PLAYWRIGHT_CLI_PATH."
        )

    if errors:
        raise CliNotFoundError("\n".join(errors))

    return node_exe, cli_js


# ---------------------------------------------------------------------------
# Command execution
# ---------------------------------------------------------------------------

def _get_paths() -> Tuple[str, str]:
    """Get cached or freshly resolved paths. Returns (node_exe, cli_js)."""
    global _NODE_EXE, _CLI_JS
    if not _NODE_EXE or not _CLI_JS:
        _NODE_EXE, _CLI_JS = resolve_paths()
    return _NODE_EXE, _CLI_JS


def run(
    *args: str,
    timeout: int = 60,
    merge_output: bool = True,
    check: bool = True,
) -> str:
    """Execute a playwright-cli command.

    Args:
        *args: Arguments to pass to playwright-cli.
        timeout: Command timeout in seconds.
        merge_output: If True, return stdout+stderr. If False, return stdout only.
        check: If True, raise CliCommandError on non-zero exit.

    Returns:
        Command output as a string.

    Raises:
        CliTimeoutError: If the command times out.
        CliCommandError: If the command exits non-zero and check=True.
    """
    node_exe, cli_js = _get_paths()
    cmd = [node_exe, cli_js, *args]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError:
        raise CliNotFoundError(f"Cannot execute {node_exe}.")
    except subprocess.TimeoutExpired as e:
        raise CliTimeoutError(
            f"Command timed out after {timeout}s: playwright-cli {' '.join(args)}"
        ) from e

    if check and result.returncode != 0:
        stderr_tail = (result.stderr or "")[-300:]
        raise CliCommandError(
            f"playwright-cli exited with code {result.returncode}: "
            f"{' '.join(args)}\n{stderr_tail}"
        )

    if merge_output:
        return (result.stdout or "") + (result.stderr or "")
    return result.stdout or ""


def log(msg: str) -> None:
    """Write diagnostic message to stderr."""
    print(f"[portal] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Browser lifecycle
# ---------------------------------------------------------------------------

def open_browser(
    url: str,
    headless: bool = True,
    timeout: int = 30,
) -> None:
    """Open the browser and navigate to the given URL.

    Args:
        url: The URL to navigate to.
        headless: Whether to run in headless mode. Default True.
        timeout: Timeout in seconds for the open command.
    """
    global _HEADLESS_CONFIG_PATH

    args: List[str] = ["open"]

    if headless:
        if _HEADLESS_CONFIG_PATH is None:
            _HEADLESS_CONFIG_PATH = _generate_headless_config()
            log(f"Headless config: {_HEADLESS_CONFIG_PATH}")
        args.append(f"--config={_HEADLESS_CONFIG_PATH}")

    args.append(url)
    run(*args, timeout=timeout)


def close_browser(timeout: int = 15) -> None:
    """Close the browser session."""
    try:
        run("close", timeout=timeout, check=False)
    except CliError:
        pass  # Best-effort close


def goto(url: str, timeout: int = 30) -> None:
    """Navigate to a URL in the existing browser session."""
    run("goto", url, timeout=timeout)


def reload(timeout: int = 15) -> None:
    """Reload the current page."""
    run("reload", timeout=timeout)


# ---------------------------------------------------------------------------
# Page interaction
# ---------------------------------------------------------------------------

def snapshot(timeout: int = 15) -> str:
    """Capture and return a page accessibility snapshot.

    Returns the raw YAML snapshot text.
    """
    return run("--raw", "snapshot", timeout=timeout, merge_output=False)


def eval_js(expr: str, timeout: int = 15) -> str:
    """Evaluate a JavaScript expression in the browser and return the result.

    Args:
        expr: JavaScript expression (e.g. "document.title").
        timeout: Timeout in seconds.

    Returns:
        The result as a trimmed string.
    """
    out = run("--raw", "eval", expr, timeout=timeout, merge_output=False)
    val = out.strip()
    # --raw mode JSON-encodes string results
    if val.startswith('"') and val.endswith('"'):
        try:
            val = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            val = val[1:-1]
    return val


def get_url(timeout: int = 10) -> str:
    """Get the current page URL."""
    return eval_js("window.location.href", timeout=timeout)


def get_title(timeout: int = 10) -> str:
    """Get the current page title."""
    return eval_js("document.title", timeout=timeout)


def click(ref: str, timeout: int = 15) -> None:
    """Click an element by its snapshot ref."""
    run("click", ref, timeout=timeout)


def fill(ref: str, text: str, submit: bool = False, timeout: int = 15) -> None:
    """Fill text into an input element by its snapshot ref."""
    args = ["fill", ref, text]
    if submit:
        args.append("--submit")
    run(*args, timeout=timeout)


def type_text(text: str, timeout: int = 15) -> None:
    """Type text into the currently focused editable element."""
    run("type", text, timeout=timeout)


def press(key: str, timeout: int = 10) -> None:
    """Press a key (e.g. 'Enter', 'Tab', 'Escape')."""
    run("press", key, timeout=timeout)


# ---------------------------------------------------------------------------
# Screenshot
# ---------------------------------------------------------------------------

def screenshot(filename: Optional[str] = None, timeout: int = 15) -> str:
    """Take a screenshot. Returns the path to the screenshot file."""
    if filename:
        out = run("screenshot", f"--filename={filename}", timeout=timeout)
    else:
        out = run("screenshot", timeout=timeout)
    # Try to extract the path from output
    match = re.search(r'(.+\.(?:png|jpg|jpeg))', out)
    if match:
        return match.group(1)
    return out.strip()


# ---------------------------------------------------------------------------
# Storage state
# ---------------------------------------------------------------------------

def state_save(filepath: str, timeout: int = 15) -> None:
    """Save browser storage state (cookies, localStorage) to a file."""
    run("state-save", filepath, timeout=timeout)


def state_load(filepath: str, timeout: int = 15) -> None:
    """Load browser storage state from a file."""
    run("state-load", filepath, timeout=timeout)
