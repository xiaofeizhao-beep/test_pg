"""
全局通用登录模块。

提供不绑定任何特定页面的通用登录流程，所有元素通过快照文本标签动态发现，
零硬编码 ref。

登录步骤：
  1. 打开目标页面
  2. 获取快照，检测当前页面状态
  3. 如果已登录 → 直接返回
  4. 如果遇到 SSO 流程 → 点击 Google SSO 按钮
  5. 动态解析并填写邮箱、密码
  6. 点击登录/提交按钮
  7. 轮询等待跳转回目标页面
  8. 返回 LoginResult

凭证通过环境变量 PORTAL_EMAIL、PORTAL_PASSWORD 获取。
"""
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from portal_utils.cli import (
    CliCommandError,
    CliError,
    CliTimeoutError,
    click,
    close_browser,
    eval_js,
    fill,
    get_title,
    get_url,
    log,
    open_browser,
    press,
    snapshot as take_snapshot,
    type_text,
)
from portal_utils.snapshot import (
    CONSENT_LABELS,
    EMAIL_LABELS,
    GOOGLE_SSO_LABELS,
    PASSWORD_LABELS,
    SUBMIT_LABELS,
    Element,
    Snapshot,
    parse_snapshot,
)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class LoginError(Exception):
    """Base exception for login-related errors."""


class ElementNotFoundError(LoginError):
    """Raised when a required page element cannot be found in the snapshot."""


class LoginTimeoutError(LoginError):
    """Raised when the login process exceeds the timeout."""


# ---------------------------------------------------------------------------
# Page state
# ---------------------------------------------------------------------------

class PageState:
    """Constants for detected page states during login."""

    ALREADY_LOGGED_IN = "already_logged_in"
    PORTAL_LOGIN_FORM = "portal_login_form"
    GOOGLE_EMAIL = "google_email"
    GOOGLE_PASSWORD = "google_password"
    GOOGLE_CONSENT = "google_consent"
    LOGGED_IN = "logged_in"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Login result
# ---------------------------------------------------------------------------

@dataclass
class LoginResult:
    """Result of a login attempt."""

    success: bool
    url: str = ""
    title: str = ""
    error: Optional[str] = None
    steps: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "url": self.url,
            "title": self.title,
            "error": self.error,
            "steps": self.steps,
        }


# ---------------------------------------------------------------------------
# State detection
# ---------------------------------------------------------------------------

def _detect_page_state(snap: Snapshot, target_domain: str) -> str:
    """Detect what page state we're in based on the snapshot.

    Args:
        snap: Parsed page snapshot.
        target_domain: The domain we want to eventually land on.

    Returns:
        One of the PageState constants.
    """
    page_text = snap.raw_text.lower()

    # Check if already on the target domain (not on /login)
    if target_domain in page_text and "/login" not in get_url().lower():
        return PageState.ALREADY_LOGGED_IN

    # Check for portal's own login form (has Google SSO and direct login form)
    if snap.find_button(GOOGLE_SSO_LABELS) and snap.find_textbox(EMAIL_LABELS):
        return PageState.PORTAL_LOGIN_FORM

    # Check for Google-specific pages
    on_google = "accounts.google.com" in get_url() or "accounts.google.com" in page_text

    if on_google:
        if snap.find_textbox(PASSWORD_LABELS):
            return PageState.GOOGLE_PASSWORD
        if snap.find_textbox(EMAIL_LABELS):
            return PageState.GOOGLE_EMAIL
        if snap.find_button(CONSENT_LABELS):
            return PageState.GOOGLE_CONSENT

    return PageState.UNKNOWN


# ---------------------------------------------------------------------------
# Main login flow
# ---------------------------------------------------------------------------

def login(
    url: str = None,
    email: str = None,
    password: str = None,
    headless: bool = True,
    login_timeout: int = 60,
    poll_interval: int = 3,
) -> LoginResult:
    """通用门户登录流程。

    所有元素通过快照文本标签动态发现，零硬编码 ref。

    Args:
        url: 目标 URL。默认从 PORTAL_URL 环境变量取。
        email: 登录邮箱。默认从 PORTAL_EMAIL 环境变量取。
        password: 登录密码。默认从 PORTAL_PASSWORD 环境变量取。
        headless: 是否无头模式。默认 True。
        login_timeout: 登录超时秒数。默认 60。
        poll_interval: 轮询间隔秒数。默认 3。

    Returns:
        LoginResult 包含 success, url, title, error, steps。

    Raises:
        CliNotFoundError: 如果 node 或 playwright-cli 未找到。
    """
    url = url or os.environ.get("PORTAL_URL", "https://portal-dev.unitpulse.ai/messages/prospects")
    email = email or os.environ.get("PORTAL_EMAIL", "")
    password = password or os.environ.get("PORTAL_PASSWORD", "")

    target_domain = _extract_domain(url)
    result = LoginResult(success=False, url=url)
    steps = result.steps

    # ==================================================================
    # Step 1: Open browser and navigate
    # ==================================================================
    step_info = {"step": 1, "action": "open_browser", "headless": headless}
    try:
        open_browser(url, headless=headless)
        time.sleep(3)
        current_url = get_url()
        step_info["url"] = current_url
        step_info["title"] = get_title()
        log(f"Opened: {current_url}")
    except CliTimeoutError as e:
        result.error = f"Browser open timed out: {e}"
        step_info["error"] = str(e)
        steps.append(step_info)
        return result
    except CliCommandError as e:
        result.error = f"Browser open failed: {e}"
        step_info["error"] = str(e)
        steps.append(step_info)
        return result
    steps.append(step_info)

    # ==================================================================
    # Step 2: Snapshot and detect state
    # ==================================================================
    step_info = {"step": 2, "action": "detect_state"}
    try:
        snap_text = take_snapshot()
        snap = parse_snapshot(snap_text)
        state = _detect_page_state(snap, target_domain)
        step_info["state"] = state
        step_info["element_count"] = len(snap)
        log(f"Detected state: {state} ({len(snap)} elements)")
    except CliError as e:
        result.error = f"Snapshot failed: {e}"
        step_info["error"] = str(e)
        steps.append(step_info)
        return result
    steps.append(step_info)

    # Fast path: already logged in
    if state == PageState.ALREADY_LOGGED_IN:
        log("Already logged in, skipping login flow.")
        result.success = True
        result.url = current_url
        result.title = get_title()
        return result

    # ==================================================================
    # Step 3: Navigate login flow based on detected state
    # ==================================================================

    # -- 3a: If on portal login form with Google SSO, click it ----------
    if state == PageState.PORTAL_LOGIN_FORM:
        step_info = {"step": 3, "action": "handle_portal_login"}
        try:
            # Strategy 1: Try portal's own login form first (email + password + submit)
            email_el = snap.find_textbox(EMAIL_LABELS)
            password_el = snap.find_textbox(PASSWORD_LABELS)
            submit_el = snap.find_button(SUBMIT_LABELS)

            if email and email_el and password_el and submit_el:
                # Direct login via portal form
                log(f"Filling email into ref={email_el.ref} ({email_el.label})")
                fill(email_el.ref, email)
                time.sleep(1)

                log(f"Filling password into ref={password_el.ref} ({password_el.label})")
                fill(password_el.ref, password)
                time.sleep(1)

                log(f"Clicking submit: ref={submit_el.ref} ({submit_el.label})")
                click(submit_el.ref)
                time.sleep(3)
                step_info["method"] = "portal_direct_login"
                step_info["email_ref"] = email_el.ref
                step_info["password_ref"] = password_el.ref
                step_info["submit_ref"] = submit_el.ref
            elif snap.find_button(GOOGLE_SSO_LABELS):
                # Fall back to Google SSO
                sso_el = snap.find_button(GOOGLE_SSO_LABELS)
                assert sso_el  # We already checked this
                log(f"Clicking Google SSO: ref={sso_el.ref} ({sso_el.label})")
                click(sso_el.ref)
                time.sleep(3)
                step_info["method"] = "google_sso"
                step_info["sso_ref"] = sso_el.ref

                # Re-snapshot after SSO click
                snap_text = take_snapshot()
                snap = parse_snapshot(snap_text)
                state = _detect_page_state(snap, target_domain)
                log(f"After SSO click → state: {state}")
                step_info["new_state"] = state
            else:
                step_info["error"] = "No login method found on portal page"
                step_info["available_buttons"] = [e.label for e in snap.elements if e.type == "button"]
                step_info["available_textboxes"] = [e.label for e in snap.elements if e.type == "textbox"]
        except CliError as e:
            step_info["error"] = str(e)
            steps.append(step_info)
            result.error = f"Portal login step failed: {e}"
            return result
        steps.append(step_info)

    # -- 3b: Fill Google email -----------------------------------------
    if state == PageState.GOOGLE_EMAIL and email:
        step_info = {"step": 4, "action": "fill_google_email"}
        try:
            email_el = snap.find_textbox(EMAIL_LABELS)
            if not email_el:
                raise ElementNotFoundError(
                    f"No email textbox found. Available textboxes: "
                    f"{[e.label for e in snap.elements if e.type == 'textbox']}"
                )
            log(f"Filling Google email into ref={email_el.ref} ({email_el.label})")
            fill(email_el.ref, email, submit=True)
            time.sleep(3)
            step_info["email_ref"] = email_el.ref
            step_info["email_label"] = email_el.label

            # Re-snapshot
            snap_text = take_snapshot()
            snap = parse_snapshot(snap_text)
            state = _detect_page_state(snap, target_domain)
            log(f"After email → state: {state}")
            step_info["new_state"] = state
        except ElementNotFoundError as e:
            step_info["error"] = str(e)
            steps.append(step_info)
            result.error = str(e)
            return result
        except CliError as e:
            step_info["error"] = str(e)
            steps.append(step_info)
            result.error = f"Google email fill failed: {e}"
            return result
        steps.append(step_info)

    # -- 3c: Fill Google password --------------------------------------
    if state == PageState.GOOGLE_PASSWORD and password:
        step_info = {"step": 5, "action": "fill_google_password"}
        try:
            pwd_el = snap.find_textbox(PASSWORD_LABELS)
            if not pwd_el:
                raise ElementNotFoundError(
                    f"No password textbox found. Available textboxes: "
                    f"{[e.label for e in snap.elements if e.type == 'textbox']}"
                )
            log(f"Filling Google password into ref={pwd_el.ref} ({pwd_el.label})")
            fill(pwd_el.ref, password, submit=True)
            time.sleep(3)
            step_info["password_ref"] = pwd_el.ref
            step_info["password_label"] = pwd_el.label

            # Re-snapshot
            snap_text = take_snapshot()
            snap = parse_snapshot(snap_text)
            state = _detect_page_state(snap, target_domain)
            log(f"After password → state: {state}")
            step_info["new_state"] = state
        except ElementNotFoundError as e:
            step_info["error"] = str(e)
            steps.append(step_info)
            result.error = str(e)
            return result
        except CliError as e:
            step_info["error"] = str(e)
            steps.append(step_info)
            result.error = f"Google password fill failed: {e}"
            return result
        steps.append(step_info)

    # -- 3d: Handle Google OAuth consent screen ------------------------
    if state == PageState.GOOGLE_CONSENT:
        step_info = {"step": 6, "action": "handle_consent"}
        try:
            consent_el = snap.find_button(CONSENT_LABELS)
            if consent_el:
                log(f"Clicking consent: ref={consent_el.ref} ({consent_el.label})")
                click(consent_el.ref)
                time.sleep(3)
                step_info["consent_ref"] = consent_el.ref
                step_info["consent_label"] = consent_el.label
            else:
                step_info["error"] = "Consent button not found"
        except CliError as e:
            step_info["error"] = str(e)
        steps.append(step_info)

    # ==================================================================
    # Step 4: Poll for redirect to target
    # ==================================================================
    log(f"Waiting for redirect to {target_domain} (max {login_timeout}s)...")
    step_info = {"step": 7, "action": "wait_redirect"}

    iterations = login_timeout // poll_interval
    logged_in = False
    final_url = get_url()

    for i in range(iterations):
        time.sleep(poll_interval)
        try:
            final_url = get_url()
            elapsed = (i + 1) * poll_interval
            log(f"  [{elapsed}s] {final_url}")

            if target_domain in final_url and "/login" not in final_url.lower():
                logged_in = True
                break
        except CliTimeoutError:
            log(f"  [{elapsed}s] eval timed out, retrying...")
        except CliCommandError:
            log(f"  [{elapsed}s] command error, retrying...")

    step_info["logged_in"] = logged_in
    step_info["url"] = final_url
    step_info["title"] = get_title()
    step_info["timeout"] = not logged_in
    steps.append(step_info)

    result.success = logged_in
    result.url = final_url
    result.title = get_title()
    if not logged_in:
        result.error = f"Login timed out after {login_timeout}s"

    log(f"Login {'succeeded' if logged_in else 'timed out'}")
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_domain(url: str) -> str:
    """Extract the domain from a URL like 'https://portal-dev.unitpulse.ai/...'."""
    url = url.replace("https://", "").replace("http://", "")
    return url.split("/")[0]


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json as _json

    headless = os.environ.get("HEADLESS", "true").lower() not in ("false", "0", "no", "off")
    log(f"Starting login: headless={headless}")

    result = login(headless=headless)

    # Output result as JSON to stdout
    print(_json.dumps(result.to_dict(), ensure_ascii=False, indent=2))

    if not result.success:
        from portal_utils.cli import state_save
        # Best-effort save auth state for debugging
        try:
            auth_path = os.path.join(os.path.dirname(__file__), "..", "auth_state.json")
            state_save(auth_path)
        except Exception:
            pass
        sys.exit(1)
