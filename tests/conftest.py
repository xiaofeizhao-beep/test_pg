"""pytest fixtures for portal testing.

Provides:
  - browser: session-scoped fixture that manages browser lifecycle
  - logged_in_page: function-scoped fixture that performs login and returns page state
"""
import pytest

import os
import sys

# Ensure portal_utils is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from portal_utils.login import login, LoginResult
from portal_utils.cli import (
    close_browser,
    get_title,
    get_url,
    log,
    snapshot as take_snapshot,
)
from portal_utils.snapshot import parse_snapshot


def pytest_configure(config):
    """Validate required environment variables before running tests."""
    email = os.environ.get("PORTAL_EMAIL", "")
    password = os.environ.get("PORTAL_PASSWORD", "")
    if not email or not password:
        log("WARNING: PORTAL_EMAIL and/or PORTAL_PASSWORD not set. Login tests will fail.")
        log("Set them via: set PORTAL_EMAIL=... && set PORTAL_PASSWORD=...")


@pytest.fixture(scope="session")
def headless():
    """Whether to use headless mode. Controlled by HEADLESS env var."""
    return os.environ.get("HEADLESS", "true").lower() not in ("false", "0", "no", "off")


@pytest.fixture(scope="session")
def portal_url():
    """Target portal URL."""
    return os.environ.get("PORTAL_URL", "https://portal-dev.unitpulse.ai/messages/prospects")


@pytest.fixture(scope="session")
def credentials():
    """Login credentials from environment."""
    return {
        "email": os.environ.get("PORTAL_EMAIL", ""),
        "password": os.environ.get("PORTAL_PASSWORD", ""),
    }


@pytest.fixture(scope="session")
def login_result(portal_url, credentials, headless):
    """Session-scoped fixture: perform login once and share across all tests.

    This is the recommended fixture for most test suites — all tests in the
    session share the same logged-in browser session.
    """
    result = login(
        url=portal_url,
        email=credentials["email"],
        password=credentials["password"],
        headless=headless,
    )
    yield result
    # Teardown: close browser after all tests
    log("Closing browser (session teardown)...")
    close_browser()


@pytest.fixture(scope="function")
def logged_in_page(portal_url, credentials, headless):
    """Function-scoped fixture: login fresh for each test.

    Use this when tests need independent browser state.
    """
    result = login(
        url=portal_url,
        email=credentials["email"],
        password=credentials["password"],
        headless=headless,
    )
    yield result
    close_browser()
