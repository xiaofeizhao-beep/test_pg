"""
conftest.py — 核心 fixtures + pytest-playwright 集成 + 报告钩子

功能:
    - 浏览器生命周期管理 (pytest-playwright)
    - 登录函数 portal_login() — 通过 shared 模块导入
    - 截图辅助 take_screenshot()
    - 失败自动截图钩子
    - pytest JSON 报告生成 (pytest_sessionfinish)
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

import pytest

# ============================================================================
# 环境变量加载

# ============================================================================
# 环境变量加载
# ============================================================================
ENV_PATH = Path(__file__).resolve().parents[3] / '.env'

if ENV_PATH.exists():
    with open(ENV_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

PORTAL_URL = os.environ.get('PORTAL_URL', 'https://portal-dev.unitpulse.ai')
WEBSITE_URL = os.environ.get('WEBSITE_URL', 'https://website-dev.unitpulse.ai')
PORTAL_EMAIL = os.environ.get('PORTAL_EMAIL', 'xiaofei.zhao@unitpulse.ai')
PORTAL_PASSWORD = os.environ.get('PORTAL_PASSWORD', '1qaz!QAZ')

SCREENSHOT_DIR = Path(__file__).resolve().parents[3] / 'tests' / 'report' / 'screenshots'


# ============================================================================
# 截图辅助
# ============================================================================

async def take_screenshot(page, name: str, full_page: bool = True) -> str:
    """保存截图到 tests/report/screenshots/"""
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    ts = int(datetime.now().timestamp() * 1000)
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '-', name)[:80]
    filename = f'{safe_name}-{ts}.png'
    filepath = SCREENSHOT_DIR / filename
    await page.screenshot(path=str(filepath), full_page=full_page)
    return str(filepath)


# ============================================================================
# 登录函数
# ============================================================================

async def portal_login(page, email: str = None, password: str = None) -> dict:
    """
    登录 portal-dev.unitpulse.ai

    返回: { success, url, title, error? }
    """
    email = email or PORTAL_EMAIL
    password = password or PORTAL_PASSWORD
    login_url = PORTAL_URL.rstrip('/') + '/login'

    try:
        # Step 1: 访问 /login
        await page.goto(login_url, wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(3000)
        await take_screenshot(page, 'login-01-page-loaded')

        # Step 2: 输入邮箱
        email_input = page.locator('input[type="email"], input[placeholder*="@"]').first
        await email_input.wait_for(state='visible', timeout=10000)
        await email_input.clear()
        await email_input.fill(email)
        await take_screenshot(page, 'login-02-email-filled')

        # Step 3: 输入密码
        pw_input = page.locator('input[type="password"]').first
        await pw_input.wait_for(state='visible', timeout=5000)
        await pw_input.clear()
        await pw_input.fill(password)
        await take_screenshot(page, 'login-03-password-filled')

        # Step 4: 点击登录
        btn = page.get_by_role('button', name=re.compile(r'enter unitpulse|sign in|log in|登录', re.IGNORECASE)).first
        await btn.wait_for(state='visible', timeout=5000)
        await btn.click()

        # Step 5: 等待跳转
        await page.wait_for_url(
            lambda url: '/login' not in url,
            timeout=60000,
        )
        await take_screenshot(page, 'login-04-login-success')

        return {'success': True, 'url': page.url, 'title': await page.title()}

    except Exception as e:
        try:
            await take_screenshot(page, 'login-error')
        except Exception:
            pass
        return {'success': False, 'url': page.url, 'title': await page.title(), 'error': str(e)}


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture(scope='session')
def browser_context_args(browser_context_args):
    """浏览器上下文参数"""
    return {
        **browser_context_args,
        'viewport': {'width': 1440, 'height': 900},
        'locale': 'en-US',
    }


@pytest.fixture
async def authenticated_page(page):
    """自动登录并返回 page"""
    result = await portal_login(page, PORTAL_EMAIL, PORTAL_PASSWORD)
    if not result['success']:
        pytest.fail(f"登录失败: {result.get('error', '未知错误')}")
    return page


# ============================================================================
# 失败自动截图钩子
# ============================================================================

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """测试失败时，自动截图并记录到报告"""
    outcome = yield
    report = outcome.get_result()

    if report.when == 'call' and report.failed:
        page = _get_page_from_item(item)
        if page:
            test_name = item.nodeid.replace('/', '-').replace('\\', '-').replace(':', '-')
            safe_name = re.sub(r'[^a-zA-Z0-9_-]', '-', test_name)[:60]
            ts = int(datetime.now().timestamp() * 1000)
            filepath = str(SCREENSHOT_DIR / f'failure-{safe_name}-{ts}.png')
            SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

            try:
                import asyncio
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    loop.run_until_complete(page.screenshot(path=filepath, full_page=True))
                else:
                    # 已在事件循环中，创建任务
                    asyncio.ensure_future(page.screenshot(path=filepath, full_page=True))
            except Exception:
                pass


def _get_page_from_item(item):
    """从 test item 的 fixture 中提取 page 对象"""
    try:
        if hasattr(item, '_request') and item._request:
            return item._request.getfixturevalue('page')
    except Exception:
        pass
    try:
        for fix_name in ['page', 'authenticated_page']:
            if fix_name in item.funcargs:
                return item.funcargs[fix_name]
    except Exception:
        pass
    return None


# ============================================================================
# pytest JSON 报告生成 (供平台 importer 使用)
# ============================================================================

def pytest_sessionfinish(session):
    """生成 tests/report/pytest_results.json，格式兼容 Playwright results.json"""
    results = {
        'config': {
            'configFile': str(Path(__file__).resolve()),
        },
        'suites': [],
        'errors': [],
    }

    report_data = getattr(session.config, '_pytest_report_data', None)
    if not report_data:
        return

    # 按文件分组
    suites = {}
    for entry in report_data:
        file_path = entry.get('file', '')
        if file_path not in suites:
            suites[file_path] = {
                'title': file_path,
                'file': file_path,
                'specs': [],
            }

        suites[file_path]['specs'].append({
            'title': entry.get('test', ''),
            'tests': [{
                'status': 'expected' if entry.get('passed') else 'unexpected',
                'results': [{
                    'duration': entry.get('duration_ms', 0),
                    'error': {
                        'message': entry.get('error_message', ''),
                        'stack': entry.get('error_stack', ''),
                    } if entry.get('error_message') else None,
                    'attachments': entry.get('attachments', []),
                }],
            }],
        })

    results['suites'] = list(suites.values())

    # 写入文件
    report_dir = Path(__file__).resolve().parents[3] / 'tests' / 'report'
    report_dir.mkdir(parents=True, exist_ok=True)
    output_path = report_dir / 'pytest_results.json'

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


# ============================================================================
# 收集测试结果数据 (由每个 test 模块的 conftest 钩子调用)
# ============================================================================

@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    """初始化报告数据容器"""
    config._pytest_report_data = []


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_logreport(report):
    """记录每个 test 的结果"""
    if report.when != 'call':
        return

    config = report._config if hasattr(report, '_config') else None
    if not config:
        return

    data = {
        'file': report.fspath,
        'test': report.head_line or report.nodeid.split('::')[-1],
        'passed': report.passed,
        'duration_ms': int(report.duration * 1000) if report.duration else 0,
        'error_message': report.longreprtext if report.failed else '',
        'error_stack': '',
        'attachments': [],
    }

    if hasattr(report, 'extras'):
        for extra in report.extras:
            if hasattr(extra, 'path'):
                data['attachments'].append({
                    'name': getattr(extra, 'name', ''),
                    'path': getattr(extra, 'path', ''),
                    'contentType': getattr(extra, 'content_type', 'image/png'),
                })

    config._pytest_report_data.append(data)
