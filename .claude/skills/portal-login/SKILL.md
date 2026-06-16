---
name: portal-login
description: Open the UnitPulse portal, log in with credentials from env vars (PORTAL_EMAIL, PORTAL_PASSWORD), and return the page state as JSON. Use when asked to open the portal, log into portal, or take a screenshot of the UnitPulse portal.
allowed-tools: Bash(python:*) Bash(playwright-cli:*) Bash(npx:*)
---

# Portal Login Automation

## Overview

This skill automates logging into the UnitPulse portal (`portal-dev.unitpulse.ai`) via `portal_utils`, a Python toolkit that wraps `playwright-cli` for zero-hardcoded-ref browser automation.

## Quick Start

```bash
python portal_utils/login.py
```

The script:
1. Opens the portal URL (default: `https://portal-dev.unitpulse.ai/messages/prospects`)
2. Detects the current page state (logged in, portal login form, Google SSO, etc.)
3. Dynamically discovers form elements by their text labels (NO hardcoded refs)
4. Fills credentials from environment variables
5. Returns JSON result to stdout

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORTAL_EMAIL` | — | Login email (required) |
| `PORTAL_PASSWORD` | — | Login password (required) |
| `PORTAL_URL` | `https://portal-dev.unitpulse.ai/messages/prospects` | Target URL |
| `HEADLESS` | `true` | Headless mode (set to `false` for visible browser) |
| `LOGIN_TIMEOUT` | `60` | Login timeout in seconds |

## Output

The script outputs JSON to stdout:
```json
{
  "success": true,
  "url": "https://portal-dev.unitpulse.ai/messages/prospects",
  "title": "UnitPulse",
  "steps": [...]
}
```

## Running Tests

```bash
# Set credentials first
set PORTAL_EMAIL=xiaofei.zhao@unitpulse.ai
set PORTAL_PASSWORD=changeme

# Run all tests
pytest tests/ -v

# Run login tests only
pytest tests/ -v -m login

# Run with visible browser
HEADLESS=false pytest tests/ -v
```

## Architecture

```
portal_utils/
├── cli.py        # playwright-cli wrapper (path resolution, command execution)
├── snapshot.py   # Zero-hardcoded-ref element discovery
└── login.py      # Universal login flow

tests/
├── conftest.py   # Pytest fixtures (browser, login_result, logged_in_page)
└── test_portal.py # Portal test cases
```

## How Elements Are Found

Elements are discovered dynamically by their **text labels** in the page snapshot — never by hardcoded refs like `e28`. The snapshot module searches for labels using multi-language patterns:

- **Email fields**: `"邮箱或电话号码"`, `"email"`, `"username"`, `"Work Email"`, `"name@company.com"`
- **Password fields**: `"输入密码"`, `"password"`, `"••••"`, `"••••••••"`
- **Submit buttons**: `"Enter Unitpulse"`, `"下一步"`, `"Next"`, `"登录"`, `"Sign in"`
- **Google SSO**: `"Continue with Google"`, `"使用 Google 继续"`

This means the script adapts automatically to page changes without code modifications.
