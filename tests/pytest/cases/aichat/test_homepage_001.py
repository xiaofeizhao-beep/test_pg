"""
AIChat Phase 1: 首页 + Composer 组件探索 (pytest 版本)

对应 tests/cases/aichat/AIChat-Phase1-Homepage.test.js
"""

import pytest
from tests.pytest.lib.composer import get_page_info
from tests.pytest.lib.queries import base_url, timeout, composer_elements, composer_dropdowns

pytestmark = pytest.mark.website


class TestAIChatHomepage:
    """首页与 Composer 组件探索"""

    @pytest.mark.asyncio
    async def test_homepage_and_composer(self, page):
        """P1-01: 验证首页加载与 Composer 组件"""
        await page.goto(base_url, wait_until='domcontentloaded', timeout=timeout['page_load'])
        await page.wait_for_timeout(4000)

        # 页面基本信息
        info = await get_page_info(page)
        assert info['title'], '页面标题不应为空'
        assert info['bodyLen'] > 0, '页面内容不应为空'
        print(f'  Title: "{info["title"]}", H1: "{info["h1"]}", Body: {info["bodyLen"]}')

        # Composer 组件可见性
        for tid in composer_elements:
            visible = await page.get_by_test_id(tid).is_visible()
            print(f'  Composer {tid}: {visible}')
            # composer-nl 和 composer-search 必须可见
            if tid in ('composer-nl', 'composer-search'):
                assert visible, f'{tid} 应可见'

        # 下拉选项数据提取
        for tid, label in composer_dropdowns:
            try:
                await page.get_by_test_id(tid).click()
                await page.wait_for_timeout(timeout['dropdown'])
                options = await page.evaluate('''() =>
                    [...document.querySelectorAll('[role="listbox"] [role="option"]')]
                        .filter(o => o.offsetParent !== null)
                        .map(o => o.textContent?.trim())
                ''')
                print(f'  {label}: {len(options)} 个选项 — {", ".join(options[:20])}')
                await page.keyboard.press('Escape')
                await page.wait_for_timeout(200)
            except Exception as e:
                print(f'  ⚠️ {label} dropdown failed: {e}')
