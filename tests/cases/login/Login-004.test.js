/**
 * 用例ID: Login-004
 * 模块: 登录
 * 标题: 验证用户登录成功后显示租户选择页
 * 优先级: P0
 *
 * 前置条件:
 *   1. 目标门户登录页可访问 (https://portal-dev.unitpulse.ai/login)
 *   2. 已准备好有效账号: xiaofei.zhao@unitpulse.ai / 1qaz!QAZ
 *
 * 操作步骤:
 *   1. 访问登录页面 https://portal-dev.unitpulse.ai/login
 *   2. 清空邮箱输入框，输入账号 xiaofei.zhao@unitpulse.ai
 *   3. 输入密码 1qaz!QAZ
 *   4. 点击登录按钮
 *
 * 预期结果:
 *   1. 页面跳转至首页（URL 不包含 /login）
 *   2. 页面显示文本 "You belong to multiple tenants. Choose one to continue."
 */
const { test, expect, takeScreenshot } = require('../../fixtures/base-fixture');

test.setTimeout(60000);

test('Login-004: 用户登录成功后显示租户选择页', async ({ page }, testInfo) => {
  const LOGIN_URL = 'https://portal-dev.unitpulse.ai/login';
  const EMAIL = 'xiaofei.zhao@unitpulse.ai';
  const PASSWORD = '1qaz!QAZ';
  const TARGET_HOST = 'portal-dev.unitpulse.ai';
  const EXPECTED_TEXT = 'You belong to multiple tenants. Choose one to continue.';

  // Step 1: 访问登录页面
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await takeScreenshot(page, 'login-01-page-loaded', testInfo);

  // Step 2: 输入账号
  const emailInput = page.locator('input[type="email"], input[placeholder*="@"]').first();
  await expect(emailInput, '邮箱输入框应可见').toBeVisible();
  await emailInput.clear();
  await emailInput.fill(EMAIL);
  await takeScreenshot(page, 'login-02-email-filled', testInfo);

  // Step 3: 输入密码
  const passwordInput = page.locator('input[type="password"]').first();
  await expect(passwordInput, '密码输入框应可见').toBeVisible();
  await passwordInput.clear();
  await passwordInput.fill(PASSWORD);
  await takeScreenshot(page, 'login-03-password-filled', testInfo);

  // Step 4: 点击登录按钮
  const submitBtn = page.getByRole('button', { name: /enter unitpulse|sign in|log in|登录/i }).first();
  await expect(submitBtn, '登录按钮应可见').toBeVisible();
  await submitBtn.click();

  // Step 5: 验证跳转 — 离开 /login 路径
  await page.waitForURL(
    (url) => url.hostname.includes(TARGET_HOST) && !url.pathname.includes('/login'),
    { timeout: 60000 },
  );

  const currentUrl = page.url();
  expect(currentUrl).toContain(TARGET_HOST);
  expect(currentUrl).not.toContain('/login');

  // Step 6: 验证租户选择文本
  const tenantText = page.getByText(EXPECTED_TEXT).first();
  await expect(tenantText, '应显示租户选择提示').toBeVisible({ timeout: 10000 });

  // Step 7: 截图留存（最终页面）
  await takeScreenshot(page, 'login-04-tenant-select', testInfo);
});
