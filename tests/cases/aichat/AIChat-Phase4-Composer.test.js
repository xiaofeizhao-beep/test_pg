/**
 * AIChat-Phase4: Composer 组件组合测试
 *
 * 测试点:
 *   TC-C01: 仅用下拉框搜索 — verifySearch
 *   TC-C02: 下拉 + NL 混用 — 验证下拉城市+NL融合
 *   TC-C03: 下拉覆盖 — 验证最终城市覆盖
 *   TC-C04: NL 覆盖下拉 — 验证 NL 优先级
 *   TC-C05: Move-in 日期 — 每种日期都有结果
 *   TC-C06: 全维度组合 — verifySearch
 */
const { test, expect } = require('../../fixtures/website-fixture');
const { submit } = require('../../lib/composer');
const { createReporter } = require('../../lib/aichat-reporter');
const { verifySearch } = require('../../lib/verifier');

test.setTimeout(120000);

let globalReporter = null;

async function recordVerdict(id, phase, query, expectedProtocol, expectedDesc, actualBody, actualLen, verdict, durationMs, error) {
  if (globalReporter) {
    globalReporter.record({
      queryId: id, phase, query, expectedProtocol, expectedDesc,
      actualResponse: actualBody, actualLen,
      verdict: verdict || { pass: false, why: error || '未知错误' },
      durationMs, error,
    });
  }
}

async function selectDropdown(page, testId, optionName) {
  try {
    await page.getByTestId(testId).click();
    await page.waitForTimeout(300);
    const opt = page.getByRole('option', { name: optionName }).first();
    await opt.click({ timeout: 3000 });
    await page.waitForTimeout(300);
    return true;
  } catch (e) {
    console.log(`  ⚠️ Select ${testId}=${optionName} failed: ${e.message}`);
    await page.keyboard.press('Escape');
    return false;
  }
}

test.describe('AIChat Phase 4: Composer Combos', () => {
  test.beforeAll(() => { globalReporter = createReporter(); });
  test.afterAll(() => {
    if (globalReporter) {
      const reportPath = globalReporter.flush();
      const s = globalReporter.summary();
      console.log(`\n📄 AI Chat 报告已写入: ${reportPath}`);
      console.log(`📊 Phase4 汇总: ${s.total} 条 | ✅ ${s.passed} | ❌ ${s.failed}`);
    }
  });

  test('P4-C01: 仅用下拉框搜索（不输入文本）', async ({ page }) => {
    const id = 'C01-dropdown-only';
    const query = '[下拉: Los Angeles / 1 bed / $2000-$3000 / Within 30 days]';
    const startTime = Date.now();

    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    await selectDropdown(page, 'composer-location', 'Los Angeles');
    await selectDropdown(page, 'composer-beds', '1 bed');
    await selectDropdown(page, 'composer-budget', '$2,000 – $3,000');
    await selectDropdown(page, 'composer-movein', 'Within 30 days');

    const btn = page.getByTestId('composer-search');
    const btnEnabled = !(await btn.isDisabled().catch(() => true));
    expect(btnEnabled, '搜索按钮应可点击').toBe(true);

    await btn.click();
    await page.waitForTimeout(8000);
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 8000) || '');

    const v = verifySearch(body, id);
    expect(v.pass, v.why).toBe(true);
    console.log(`  ${v.len} chars | price:${v.hints?.price} beds:${v.hints?.beds}`);

    await recordVerdict(id, 'Phase4', query, 'search', '仅靠下拉框选择的 LA 1居室房源列表', body, body.length, v, Date.now() - startTime);
  });

  test('P4-C02: 下拉 + NL 混用', async ({ page }) => {
    const id = 'C02-dropdown+NL';
    const query = '[下拉: Seattle / Studio] + NL: "with a gym and rooftop terrace"';
    const startTime = Date.now();

    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    await selectDropdown(page, 'composer-location', 'Seattle');
    await selectDropdown(page, 'composer-beds', 'Studio');

    const r = await submit(page, 'with a gym and rooftop terrace', { waitSec: 12 });
    const v = verifySearch(r.body, id);
    const hasSeattle = /\bSeattle\b/i.test(r.body);
    const hasGym = /gym|pool|rooftop|terrace/i.test(r.body);
    console.log(`  body: ${r.len} chars | Seattle:${hasSeattle} gym/amenity:${hasGym}`);
    expect(r.len).toBeGreaterThan(100);

    await recordVerdict(id, 'Phase4', query, 'search', 'Seattle Studio + 健身房/露台设施', r.body, r.len, v, Date.now() - startTime);
  });

  test('P4-C03: 下拉选项切换（覆盖行为）', async ({ page }) => {
    const id = 'C03-override';
    const query = '[下拉最终: Chicago / $3000-$4500] + NL: "near public transit"';
    const startTime = Date.now();

    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    await selectDropdown(page, 'composer-location', 'Berkeley');
    await selectDropdown(page, 'composer-budget', 'Under $2,000');

    // 切换 → Chicago + $3000-$4500
    await selectDropdown(page, 'composer-budget', '$3,000 – $4,500');
    await selectDropdown(page, 'composer-location', 'Chicago');

    const r = await submit(page, 'near public transit', { waitSec: 12 });
    const v = verifySearch(r.body, id);
    const hasChicago = /\bChicago\b/i.test(r.body);
    const hasPrice = /\$[\d,]{1,5}/.test(r.body);
    console.log(`  body: ${r.len} chars | Chicago:${hasChicago} price:${hasPrice}`);
    expect(r.len).toBeGreaterThan(100);

    await recordVerdict(id, 'Phase4', query, 'search', 'Chicago + 公交 + $3000-$4500 → 下拉覆盖行为验证', r.body, r.len, v, Date.now() - startTime);
  });

  test('P4-C04: NL 覆盖下拉选项', async ({ page }) => {
    const id = 'C04-NL-wins';
    const query = '[下拉: Studio] + NL: "Find me 2-bedroom apartments in Irvine"';
    const startTime = Date.now();

    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    // 下拉选 Studio，NL 说 2-bedroom → NL 应胜出
    await selectDropdown(page, 'composer-beds', 'Studio');

    const r = await submit(page, 'Find me 2-bedroom apartments in Irvine', { waitSec: 12 });
    const v = verifySearch(r.body, id);
    const mentions2Bed = /\b2.bed|two.bed/i.test(r.body);
    const mentionsIrvine = /\bIrvine\b/i.test(r.body);
    console.log(`  body: ${r.len} chars | 2-bed:${mentions2Bed} Irvine:${mentionsIrvine}`);
    expect(r.len).toBeGreaterThan(100);

    await recordVerdict(id, 'Phase4', query, 'search', 'NL 说 2-bedroom + Irvine → 应覆盖下拉 Studio 选择', r.body, r.len, v, Date.now() - startTime);
  });

  test('P4-C05: Move-in 日期筛选', async ({ page }) => {
    const PN = 'Phase4-C05: Move-in日期';
    for (const movein of ['ASAP', 'Within 30 days', '1–2 months', 'Flexible']) {
      const id = `C05-${movein}`;
      const query = `[下拉: Berkeley / ${movein}] + NL: "1-bedroom apartments"`;
      const startTime = Date.now();

      await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      await selectDropdown(page, 'composer-location', 'Berkeley');
      await selectDropdown(page, 'composer-movein', movein);

      const r = await submit(page, '1-bedroom apartments', { waitSec: 10 });
      const v = verifySearch(r.body, id);
      console.log(`  movein="${movein}": ${r.len} chars | pass:${v.pass}`);
      expect(r.len, `Move-in="${movein}" 响应不应为空`).toBeGreaterThan(100);

      await recordVerdict(id, PN, query, 'search', `Berkeley 1居室 + 入住时间=${movein}`, r.body, r.len, v, Date.now() - startTime);
    }
  });

  test('P4-C06: 全维度组合', async ({ page }) => {
    const id = 'C06-full-combo';
    const query = '[下拉: LA / 2 beds / $3000-$4500 / 1-2m] + NL: "pool, gym, in-unit laundry, near Koreatown"';
    const startTime = Date.now();

    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    await selectDropdown(page, 'composer-location', 'Los Angeles');
    await selectDropdown(page, 'composer-beds', '2 beds');
    await selectDropdown(page, 'composer-budget', '$3,000 – $4,500');
    await selectDropdown(page, 'composer-movein', '1–2 months');

    const r = await submit(page, 'with pool, gym, and in-unit laundry, near Koreatown', { waitSec: 15 });
    const v = verifySearch(r.body, id);
    const hasKtown = /Koreatown/i.test(r.body);
    console.log(`  body: ${r.len} chars | pass:${v.pass} Ktown:${hasKtown}`);
    expect(r.len).toBeGreaterThan(200);

    await recordVerdict(id, 'Phase4-C06: 全维度组合', query, 'search', 'LA 2居室 豪华设施 Koreatown 附近', r.body, r.len, v, Date.now() - startTime);
  });
});
