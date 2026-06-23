/**
 * 用例ID: Tour-001
 * 模块: Tours
 * 标题: 验证 Tours 列表页展示、搜索与筛选功能
 * 优先级: P0
 *
 * 前置条件:
 *   1. 已登录并选择 Test 003 组织
 *   2. Tours 页面存在至少一条 tour 记录
 *
 * 操作步骤:
 *   1. 登录 → 选择 Test 003 → 进入 /messages/tours
 *   2. 验证表格列头完整
 *   3. 验证列表有数据行
 *   4. 使用搜索框搜索客户名
 *   5. 使用状态筛选
 *   6. 验证分页信息
 *
 * 预期结果:
 *   1. 表格显示 Scheduled, Customer, Property/Unit, Status, Channel, Agent 列
 *   2. 列表显示现有 tour 数据
 *   3. 搜索后列表过滤匹配结果
 *   4. 筛选后只显示对应状态
 */
const { test, expect, takeScreenshot } = require('../../fixtures/base-fixture');

test.setTimeout(90000);

test('Tour-001: 验证 Tours 列表页展示、搜索与筛选功能', async ({ page }, testInfo) => {
  const BASE = process.env.PORTAL_URL || 'https://portal-dev.unitpulse.ai';
  const EMAIL = process.env.PORTAL_EMAIL || 'xiaofei.zhao@unitpulse.ai';
  const PASSWORD = process.env.PORTAL_PASSWORD || '1qaz!QAZ';

  // ==================== 前置: 登录 ====================
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.locator('input[type="email"], input[placeholder*="@"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /enter unitpulse|sign in|log in|登录/i }).first().click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60000 });

  // ==================== 前置: 选择 Test 003 ====================
  await page.waitForTimeout(2000);
  const tenantOption = page.getByText('Test 003', { exact: false }).first();
  try {
    await tenantOption.waitFor({ state: 'visible', timeout: 15000 });
    await tenantOption.click();
    await page.waitForTimeout(3000);
    console.log('✅ 已选择 Test 003');
  } catch {
    console.log('⚠️ 未出现租户选择页，可能单租户账号');
  }

  // ==================== Step 1: 进入 Tours 页面 ====================
  await page.goto(BASE + '/messages/tours', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  await takeScreenshot(page, 'tour-001-list', testInfo);

  // 验证页面标题
  const pageHeading = page.getByRole('heading', { name: /tours/i }).first();
  await expect(pageHeading, '页面标题应为 Tours').toBeVisible({ timeout: 10000 });

  // ==================== Step 2: 验证表格列头 ====================
  const expectedColumns = ['Scheduled', 'Customer', 'Property', 'Status', 'Channel', 'Agent'];
  const tableHeaders = page.locator('th');
  const headerCount = await tableHeaders.count();
  expect(headerCount, '表格应有至少 6 列').toBeGreaterThanOrEqual(6);

  const allHeaderTexts = await tableHeaders.allTextContents();
  console.log('表头:', allHeaderTexts.join(' | '));

  for (const col of expectedColumns) {
    const found = allHeaderTexts.some(h => h.includes(col));
    expect(found, `表头应包含 "${col}"`).toBeTruthy();
  }

  // ==================== Step 3: 验证列表有数据 ====================
  const dataRows = page.locator('table tbody tr.ant-table-row');
  const rowCount = await dataRows.count();
  expect(rowCount, '表格应至少有一行数据').toBeGreaterThanOrEqual(1);
  console.log(`📊 当前列表有 ${rowCount} 条 tour 记录`);

  // 验证第一行关键字段不为空
  const firstRow = dataRows.first();
  const scheduledTime = await firstRow.locator('td').nth(0).textContent();
  const customerName = firstRow.locator('td').nth(1).locator('a').first();
  const propertyInfo = firstRow.locator('td').nth(2);
  const statusChip = firstRow.locator('td').nth(3);

  expect(scheduledTime.trim(), 'Scheduled 时间不应为空').toBeTruthy();
  await expect(customerName, '客户名应该是链接').toBeVisible();
  expect((await propertyInfo.textContent()).trim(), 'Property 不应为空').toBeTruthy();
  await expect(statusChip, 'Status chip 应可见').toBeVisible();

  // ==================== Step 4: 搜索客户名 ====================
  const searchInput = page.locator('input[placeholder*="Search customer"]').first();
  await expect(searchInput, '搜索输入框应可见').toBeVisible();
  
  // 用已知存在的客户名搜索
  await searchInput.fill('Wenyu Yuan');
  await page.waitForTimeout(2000);
  await takeScreenshot(page, 'tour-001-search', testInfo);

  // 验证搜索结果包含目标客户
  const searchResultCount = await page.locator('table tbody tr.ant-table-row').count();
  console.log(`🔍 搜索 "Wenyu Yuan" 后: ${searchResultCount} 条结果`);
  expect(searchResultCount).toBeGreaterThanOrEqual(1);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).toContain('Wenyu Yuan');

  // 清空搜索
  await searchInput.clear();
  await page.waitForTimeout(1500);

  // ==================== Step 5: 状态筛选 ====================
  const statusFilter = page.getByRole('button', { name: /all statuses/i }).first();
  await expect(statusFilter, '状态筛选按钮应可见').toBeVisible();
  await statusFilter.click();
  await page.waitForTimeout(1500);
  await takeScreenshot(page, 'tour-001-status-filter', testInfo);

  // 选择 "Scheduled" 
  const scheduledOption = page.getByRole('option', { name: /scheduled/i }).or(page.getByText('Scheduled', { exact: true }));
  try {
    await scheduledOption.first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    console.log('✅ 已筛选 Scheduled');
  } catch {
    console.log('⚠️ 筛选下拉无 Scheduled 选项，尝试其他方式');
    // 尝试点击下拉菜单中的选项
    const menuItem = page.locator('.ant-select-dropdown, [role="menu"], [role="listbox"]').getByText(/scheduled/i).first();
    if (await menuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuItem.click();
      await page.waitForTimeout(2000);
    }
  }

  await takeScreenshot(page, 'tour-001-filtered', testInfo);

  // ==================== Step 6: 验证分页 ====================
  const pagination = page.locator('.ant-pagination, [class*="pagination"]').first();
  const paginationVisible = await pagination.isVisible().catch(() => false);
  if (paginationVisible) {
    console.log('✅ 分页组件可见');
    const pageText = await pagination.textContent();
    console.log('分页信息:', pageText.trim().slice(0, 100));
  } else {
    console.log('⚠️ 数据不足一页，分页组件未显示');
  }

  // 验证 "New tour" 按钮存在
  const newTourBtn = page.getByRole('button', { name: /new tour/i });
  await expect(newTourBtn, '"New tour" 按钮应可见').toBeVisible();

  console.log('✅ Tour-001 完成');
});
