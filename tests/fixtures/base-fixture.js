/**
 * base-fixture.js — 公共前置 & 登录封装
 *
 * 提供:
 *   - 登录流程封装
 *   - authenticatedPage fixture（自动登录）
 *   - 失败自动截图 + 关键步骤截图 hook
 */
import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// ============================================================================
// 环境变量加载
// ============================================================================

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

// ============================================================================
// 凭据 & URL
// ============================================================================

const PORTAL_BASE = process.env.PORTAL_URL || 'https://portal-dev.unitpulse.ai';
const PORTAL_EMAIL = process.env.PORTAL_EMAIL || 'xiaofei.zhao@unitpulse.ai';
const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD || '1qaz!QAZ';
const LOGIN_TIMEOUT = parseInt(process.env.LOGIN_TIMEOUT || '60', 10) * 1000;

// ============================================================================
// 截图辅助
// ============================================================================

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tests', 'report', 'screenshots');

/**
 * 页面截图 — 保存到 tests/report/screenshots/ 并附加到 Playwright 报告
 * @param {import('@playwright/test').Page} page
 * @param {string} name - 截图步骤名
 * @param {import('@playwright/test').TestInfo} [testInfo] - 传入即可自动附加到报告
 */
async function takeScreenshot(page, name, testInfo) {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  const timestamp = Date.now();
  const fileName = `${name}-${timestamp}.png`;
  const filePath = path.join(SCREENSHOT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });

  // 如果传入了 testInfo，附加到 Playwright 报告（使截图出现在 results.json attachments 中）
  if (testInfo) {
    try {
      await testInfo.attach(name, { path: filePath, contentType: 'image/png' });
    } catch (_) { /* ignore */ }
  }

  return filePath;
}

// ============================================================================
// 登录函数
// ============================================================================

/**
 * 登录流程 — 带截图的关键步骤
 */
export async function login(page, opts = {}) {
  const email = opts.email || PORTAL_EMAIL;
  const password = opts.password || PORTAL_PASSWORD;
  const baseUrl = opts.url || PORTAL_BASE;
  const loginUrl = baseUrl.replace(/\/+$/, '') + '/login';
  const targetDomain = new URL(baseUrl).hostname;

  try {
    // Step 1: 访问 /login 页面
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, 'login-01-page-loaded');

    // Step 2: 清空并输入邮箱
    const emailInput = page.locator('input[type="email"], input[placeholder*="@"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.clear();
    await emailInput.fill(email);
    await takeScreenshot(page, 'login-02-email-filled');

    // Step 3: 输入密码
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.clear();
    await passwordInput.fill(password);
    await takeScreenshot(page, 'login-03-password-filled');

    // Step 4: 点击登录按钮
    const submitBtn = page.getByRole('button', { name: /enter unitpulse|sign in|log in|登录/i }).first();
    await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
    await submitBtn.click();

    // Step 5: 等待跳转
    await page.waitForURL(
      (url) => url.hostname.includes(targetDomain) && !url.pathname.includes('/login'),
      { timeout: LOGIN_TIMEOUT },
    );
    await takeScreenshot(page, 'login-04-login-success');

    return { success: true, url: page.url(), title: await page.title() };
  } catch (e) {
    await takeScreenshot(page, 'login-error').catch(() => {});
    return { success: false, url: page.url(), title: await page.title(), error: e.message };
  }
}

// ============================================================================
// 自定义 fixture: test — 带失败自动截图 hooks
// ============================================================================

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    const result = await login(page);
    if (!result.success) {
      throw new Error(`登录失败: ${result.error}`);
    }
    await use(page);
  },
});

// 在每个测试后自动截图
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshotPath = await takeScreenshot(page, `failure-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-')}`);
    // 附加到 Playwright 报告
    await testInfo.attach('failure-screenshot', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});

export { expect, takeScreenshot };
