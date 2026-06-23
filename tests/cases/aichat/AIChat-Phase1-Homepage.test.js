/**
 * AIChat-Phase1: 首页 + Composer 组件探索
 *
 * 测试点:
 *   1. 页面标题/导航结构
 *   2. Composer 组件 (composer-nl, composer-search, composer-location 等) 可见性
 *   3. 下拉选项数据提取
 */
const { test, expect } = require('../../fixtures/website-fixture');
const { getPageInfo } = require('../../lib/composer');
const config = require('../../lib/queries.json');

test.setTimeout(60000);

test.describe('AIChat Phase 1: Homepage + Composer', () => {
  test('P1-01: 验证首页加载与 Composer 组件', async ({ page }) => {
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout.pageLoad });
    await page.waitForTimeout(4000);

    // 页面基本信息
    const info = await getPageInfo(page);
    expect(info.title).toBeTruthy();
    expect(info.bodyLen).toBeGreaterThan(0);
    console.log(`  Title: "${info.title}", H1: "${info.h1}", Body: ${info.bodyLen}`);

    // Composer 组件可见性
    for (const tid of config.composerElements) {
      const visible = await page.getByTestId(tid).isVisible().catch(() => false);
      console.log(`  Composer ${tid}: ${visible}`);
      // composer-nl 和 composer-search 必须可见
      if (tid === 'composer-nl' || tid === 'composer-search') {
        expect(visible, `${tid} 应可见`).toBe(true);
      }
    }

    // 下拉选项数据提取
    for (const [tid, label] of config.composerDropdowns) {
      try {
        await page.getByTestId(tid).click();
        await page.waitForTimeout(config.timeout.dropdown);
        const options = await page.evaluate(() =>
          [...document.querySelectorAll('[role="listbox"] [role="option"]')]
            .filter(o => o.offsetParent !== null)
            .map(o => o.textContent?.trim())
        );
        console.log(`  ${label}: ${options.length} 个选项 — ${options.join(', ')}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      } catch (e) {
        console.log(`  ⚠️ ${label} dropdown failed: ${e.message}`);
      }
    }
  });
});
