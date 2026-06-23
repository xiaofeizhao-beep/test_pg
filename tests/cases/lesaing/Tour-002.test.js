/**
 * 用例ID: Tour-002
 * 模块: Tours
 * 标题: 验证 New Tour 创建表单展示与交互
 * 优先级: P0
 *
 * 前置条件:
 *   1. 已登录并选择 Test 003 组织
 *   2. 进入 /messages/tours 页面
 *
 * 操作步骤:
 *   1. 点击 "New tour" 按钮
 *   2. 验证 Drawer 面板打开
 *   3. 验证表单标题和必填字段存在
 *   4. 验证 Customer / Property 选择按钮
 *   5. 验证 Tour length、Date、Notes 控件
 *   6. 验证 Cancel / Schedule Tour 按钮
 *   7. 点击 Cancel 关闭
 *
 * 预期结果:
 *   1. 弹出 "Schedule Property Tour" 侧边面板
 *   2. 表单包含所有必要字段
 *   3. Cancel 能正常关闭
 */
const { test, expect, takeScreenshot } = require('../../fixtures/base-fixture');

test.setTimeout(120000);

test('Tour-002: 验证 New Tour 创建表单展示与交互', async ({ page }, testInfo) => {
  const BASE = process.env.PORTAL_URL || 'https://portal-dev.unitpulse.ai';
  const EMAIL = process.env.PORTAL_EMAIL || 'xiaofei.zhao@unitpulse.ai';
  const PASSWORD = process.env.PORTAL_PASSWORD || '1qaz!QAZ';

  // ==================== 前置: 登录 → 选组织 → 进 Tours ====================
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.locator('input[type="email"], input[placeholder*="@"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /enter unitpulse|sign in|log in|登录/i }).first().click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60000 });
  await page.waitForTimeout(2000);
  try {
    await page.getByText('Test 003', { exact: false }).first().click({ timeout: 15000 });
    await page.waitForTimeout(3000);
  } catch {}

  await page.goto(BASE + '/messages/tours', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // ==================== Step 1: 点击 "New tour" ====================
  const newTourBtn = page.getByRole('button', { name: /new tour/i });
  await expect(newTourBtn, '"New tour" 按钮应可见').toBeVisible();
  await newTourBtn.click();
  await page.waitForTimeout(3000);
  await takeScreenshot(page, 'tour-002-form-opened', testInfo);

  // ==================== Step 2: 验证 Drawer 面板 ====================
  const drawer = page.locator('.ant-drawer').first();
  await expect(drawer, 'Drawer 面板应可见').toBeVisible({ timeout: 10000 });

  // 表单标题
  const formTitle = drawer.getByText('Schedule Property Tour').first();
  await expect(formTitle, '表单标题应为 "Schedule Property Tour"').toBeVisible({ timeout: 10000 });

  // ==================== Step 3: 验证所有字段存在 ====================

  // 3a. Customer* 必填字段
  const customerBtn = drawer.getByRole('button', { name: /search a customer/i }).first();
  await expect(customerBtn, 'Customer 选择按钮应可见').toBeVisible({ timeout: 8000 });
  console.log('✅ Customer 字段存在');

  // 3b. Property* 必填字段
  const propertyBtn = drawer.getByRole('button', { name: /search and select a property/i }).first();
  await expect(propertyBtn, 'Property 选择按钮应可见').toBeVisible({ timeout: 5000 });
  console.log('✅ Property 字段存在');

  // 3c. Tour length — Duration & Buffer 下拉
  const selects = drawer.locator('select');
  const selectCount = await selects.count();
  console.log(`📋 Tour length 下拉数: ${selectCount}`);
  // 至少有一个 Duration select
  expect(selectCount, '应至少有 1 个 Tour length 下拉').toBeGreaterThanOrEqual(1);

  // 3d. Date picker (初始可能 disabled，依赖 Customer/Property 先选)
  const dateInput = drawer.locator('input[placeholder*="date" i], input[placeholder*="Select date" i]').first();
  const datePresent = await dateInput.isVisible({ timeout: 3000 }).catch(() => false);
  expect(datePresent, '日期选择器应存在于表单中').toBeTruthy();
  console.log('✅ Date 字段存在');

  await takeScreenshot(page, 'tour-002-form-fields', testInfo);

  // 3e. Notes textarea
  const notesArea = drawer.locator('textarea').first();
  await expect(notesArea, 'Notes 文本框应可见').toBeVisible({ timeout: 5000 });
  
  // 测试 Notes 可编辑
  await notesArea.fill('自动化测试备注: Tour form validation test');
  const notesValue = await notesArea.inputValue();
  expect(notesValue).toContain('自动化测试');
  console.log('✅ Notes 字段可正常填写');

  await takeScreenshot(page, 'tour-002-notes', testInfo);

  // ==================== Step 4: 验证操作按钮 ====================
  // 注意: 按钮在 drawer footer 中
  const cancelBtns = page.getByRole('button', { name: /^cancel$/i });
  const scheduleBtns = page.getByRole('button', { name: /schedule tour/i });

  // 找可见的那个（drawer 内的）
  let cancelBtn = null;
  let scheduleBtn = null;
  for (let i = 0; i < await cancelBtns.count(); i++) {
    if (await cancelBtns.nth(i).isVisible()) { cancelBtn = cancelBtns.nth(i); break; }
  }
  for (let i = 0; i < await scheduleBtns.count(); i++) {
    if (await scheduleBtns.nth(i).isVisible()) { scheduleBtn = scheduleBtns.nth(i); break; }
  }

  expect(cancelBtn, 'Cancel 按钮应存在于表单中').not.toBeNull();
  expect(scheduleBtn, 'Schedule Tour 按钮应存在于表单中').not.toBeNull();
  await expect(cancelBtn, 'Cancel 按钮应可见').toBeVisible({ timeout: 5000 });
  await expect(scheduleBtn, 'Schedule Tour 按钮应可见').toBeVisible({ timeout: 5000 });
  console.log('✅ Cancel / Schedule Tour 按钮均可见');

  // ==================== Step 5: 点击 Cancel 关闭 ====================
  await cancelBtn.click();
  await page.waitForTimeout(2000);
  await takeScreenshot(page, 'tour-002-form-closed', testInfo);

  // 验证 Drawer 已关闭
  const drawerVisible = await drawer.isVisible({ timeout: 5000 }).catch(() => false);
  expect(drawerVisible, 'Drawer 应在 Cancel 后关闭').toBeFalsy();
  console.log('✅ Drawer 已关闭');

  console.log('✅ Tour-002 完成');
});
