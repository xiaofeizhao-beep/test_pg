/**
 * website-fixture.js — Website (AI Chat) 轻量 fixture
 *
 * 与 base-fixture.js 的区别:
 *   - 不需要登录 (website-dev.unitpulse.ai 是公开网站)
 *   - 使用 website 的 baseURL
 *   - 保留失败自动截图
 *   - 直接继承 @playwright/test 的 test 和 expect
 */
const { test: base, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// ============================================================================
// 截图辅助（与 base-fixture.js 一致的实现）
// ============================================================================

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tests', 'report', 'screenshots');

async function takeScreenshot(page, name, testInfo) {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  const timestamp = Date.now();
  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  const fileName = `${sanitizedName}-${timestamp}.png`;
  const filePath = path.join(SCREENSHOT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });

  if (testInfo) {
    try {
      await testInfo.attach(name, { path: filePath, contentType: 'image/png' });
    } catch (_) { /* ignore */ }
  }
  return filePath;
}

// ============================================================================
// 自定义 fixture: test（不登录，直接用 page）
// ============================================================================

const test = base.extend({
  // 覆盖 baseURL 为 website-dev
  baseURL: 'https://website-dev.unitpulse.ai',
});

// 失败时自动截图
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const fileName = `failure-aichat-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60)}`;
    const screenshotPath = await takeScreenshot(page, fileName);
    await testInfo.attach('failure-screenshot', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});

module.exports = { test, expect, takeScreenshot };
