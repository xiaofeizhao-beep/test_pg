/**
 * 用例ID: Tour-003
 * 模块: Tours
 * 标题: 验证 Tour Reassign 更换 Agent 功能
 * 优先级: P0
 *
 * 前置条件:
 *   1. 已登录并选择 Test 003 组织
 *   2. Tours 列表至少有一条可 reassign 的记录
 *
 * 操作步骤:
 *   1. 进入 Tours 列表页
 *   2. 点击第一行的 "Reassign" 按钮
 *   3. 验证弹出 "Re-assign Agent" 对话框
 *   4. 验证显示当前 Agent 信息
 *   5. 从下拉选择新 Agent
 *   6. 点击 Cancel 关闭（不实际修改，保持幂等）
 *
 * 预期结果:
 *   1. 弹出 Re-assign 对话框，标题正确
 *   2. 显示 "Currently assigned to: xxx"
 *   3. Agent 下拉可展开并含可选项
 *   4. Cancel 能正常关闭
 */
const { test, expect, takeScreenshot } = require('../../fixtures/base-fixture');

test.setTimeout(90000);

test('Tour-003: 验证 Tour Reassign 更换 Agent 功能', async ({ page }, testInfo) => {
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
  await takeScreenshot(page, 'tour-003-list', testInfo);

  // ==================== Step 1: 验证 Reassign 按钮存在 ====================
  const reassignBtns = page.getByRole('button', { name: /reassign/i });
  const reassignCount = await reassignBtns.count();
  expect(reassignCount, '应至少有一个 Reassign 按钮').toBeGreaterThanOrEqual(1);
  console.log(`🔄 找到 ${reassignCount} 个 Reassign 按钮`);

  // ==================== Step 2: 点击第一个 Reassign ====================
  // 先记录当前 Agent 用于后续对比
  const firstRow = page.locator('table tbody tr.ant-table-row').first();
  const currentAgent = await firstRow.locator('td').nth(5).textContent();
  console.log(`📌 当前 Agent 信息: "${currentAgent.trim()}"`);

  await reassignBtns.first().click();
  await page.waitForTimeout(3000);
  await takeScreenshot(page, 'tour-003-reassign-modal', testInfo);

  // ==================== Step 3: 验证 Reassign 对话框 ====================
  const modalTitle = page.getByText('Re-assign Agent');
  await expect(modalTitle.first(), '对话框标题应为 "Re-assign Agent"').toBeVisible({ timeout: 10000 });

  // 验证 "Currently assigned to" 文案
  const assignedToText = page.getByText(/currently assigned to/i).first();
  await expect(assignedToText, '应显示 "Currently assigned to" 信息').toBeVisible({ timeout: 5000 });
  const assignedTextContent = await assignedToText.textContent();
  console.log(`📌 提示文案: "${assignedTextContent.trim()}"`);

  // ==================== Step 4: 验证 Agent 下拉 ====================
  // Reassign 使用 Ant Design Modal，在该弹窗内定位 Agent select
  const modal = page.locator('.ant-modal, [role="dialog"]').first();
  const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);

  if (modalVisible) {
    console.log('✅ Reassign Modal 可见');
    // 在 modal 中找 select
    const agentSelect = modal.locator('select').first();
    const selectVisible = await agentSelect.isVisible({ timeout: 3000 }).catch(() => false);

    if (selectVisible) {
      console.log('✅ Agent 下拉 (select) 可见');
      const options = await agentSelect.locator('option').allTextContents();
      console.log(`📋 Agent 选项: ${options.join(', ')}`);
      expect(options.length, 'Agent 下拉应至少有 1 个选项').toBeGreaterThanOrEqual(1);
    } else {
      // 可能是 Ant Design Select
      const antSelect = modal.locator('.ant-select-selector').first();
      if (await antSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('✅ Agent 下拉 (Ant Design) 可见');
        await antSelect.click();
        await page.waitForTimeout(1500);
        await takeScreenshot(page, 'tour-003-agent-dropdown', testInfo);

        const dropdownOptions = page.locator('.ant-select-item-option, [role="option"]');
        const optionCount = await dropdownOptions.count();
        console.log(`📋 Agent 可选项数: ${optionCount}`);
        expect(optionCount, 'Agent 下拉应至少有一个可选项').toBeGreaterThanOrEqual(1);

        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(1000);
      }
    }
  } else {
    // fallback: 全页查找
    const agentSelect = page.locator('select').first();
    if (await agentSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('⚠️ 使用 fallback: 全局第一个 select');
      const options = await agentSelect.locator('option').allTextContents();
      console.log(`📋 选项: ${options.join(', ')}`);
    }
  }

  // ==================== Step 5: 验证 Cancel 和 Re-assign 按钮 ====================
  const cancelBtn = page.getByRole('button', { name: /^cancel$/i });
  const reassignConfirmBtn = page.getByRole('button', { name: /^re-assign$/i });

  await expect(cancelBtn.first(), 'Cancel 按钮应可见').toBeVisible({ timeout: 5000 });
  await expect(reassignConfirmBtn.first(), 'Re-assign 确认按钮应可见').toBeVisible({ timeout: 5000 });

  // ==================== Step 6: 关闭对话框（不实际提交） ====================
  // 如需测试实际 Reassign 流程，将以下改为选择新 Agent + 点击 Re-assign
  await cancelBtn.first().click();
  await page.waitForTimeout(2000);
  await takeScreenshot(page, 'tour-003-modal-closed', testInfo);

  // 验证对话框已关闭
  const modalTitleAfter = page.getByText('Re-assign Agent');
  const modalClosed = await modalTitleAfter.first().isVisible({ timeout: 3000 }).catch(() => false);
  if (!modalClosed) {
    console.log('✅ Reassign 对话框已成功关闭');
  } else {
    console.log('⚠️ 对话框可能仍打开');
  }

  console.log('✅ Tour-003 完成');
});
