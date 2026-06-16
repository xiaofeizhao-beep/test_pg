"""Portal 门户登录与页面验证测试。"""
import pytest

from portal_utils.cli import get_title, get_url, log, snapshot as take_snapshot
from portal_utils.snapshot import parse_snapshot


class TestPortalLogin:
    """登录流程测试。"""

    @pytest.mark.login
    def test_login_success(self, login_result):
        """验证登录成功，重定向到目标页面。"""
        assert login_result.success, (
            f"Login failed: {login_result.error}\n"
            f"Steps: {login_result.steps}"
        )
        assert login_result.url, "URL should not be empty"
        assert "portal-dev.unitpulse.ai" in login_result.url, (
            f"Expected portal domain, got: {login_result.url}"
        )

    @pytest.mark.login
    def test_login_url_has_no_login_path(self, login_result):
        """验证登录后的 URL 不包含 /login 路径。"""
        assert login_result.success
        assert "/login" not in login_result.url.lower(), (
            f"URL still contains /login: {login_result.url}"
        )


class TestPortalPage:
    """登录后页面内容测试。"""

    @pytest.mark.login
    def test_page_has_title(self, login_result):
        """验证登录后页面有标题。"""
        assert login_result.success
        assert login_result.title, "Page title should not be empty"

    @pytest.mark.login
    def test_snapshot_has_content(self, login_result):
        """验证登录后页面快照包含可交互元素。"""
        assert login_result.success
        snap_text = take_snapshot()
        snap = parse_snapshot(snap_text)
        assert len(snap) > 0, (
            f"Snapshot should contain elements. Raw text:\n{snap_text[:500]}"
        )
