/**
 * AIChat-Phase2: 搜索查询连续对话
 *
 * 合并原 Phase 2+3+4+5，单 session 串联 29 条查询
 * 模拟真实用户在一个聊天框中连续提问
 *
 * 基于 V4 协议校验:
 *   - SEARCH → list  (含$价格 + 地址/城市)
 *   - DETAIL → text  (含户型 + 价格)
 *   - COMPARE → text (含对比词)
 *   - FOLLOW_UP → text (含反问)
 */
const { test, expect } = require('../../fixtures/website-fixture');
const { submit } = require('../../lib/composer');
const config = require('../../lib/queries.json');
const { createReporter, OUTPUT_FILE } = require('../../lib/aichat-reporter');
const {
  verifySearch, verifyDetail, verifyComparison, verifyFollowUp,
} = require('../../lib/verifier');

test.setTimeout(600000);

test('P2-Search: 连续搜索对话 (29 queries in single session)', async ({ page }) => {
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout.pageLoad });
  await page.waitForTimeout(4000);

  const reporter = createReporter();
  let pass = 0, fail = 0, qn = 0;

  async function ask(id, query, verifyFn, opts = {}) {
    qn++;
    const label = `[${qn}/29]`;
    const phase = opts.phase || 'Search';
    const expectedProtocol = opts.expectedProtocol || 'search';
    const startTime = Date.now();

    console.log(`\n  ${label} ${id}: "${query.slice(0, 60)}"`);
    try {
      const r = await submit(page, query, { waitSec: opts.waitSec || 10 });
      const elapsed = Date.now() - startTime;

      // 多维度校验
      const v = verifyFn(r.body);
      if (!v.pass) {
        console.log(`    ❌ VERIFY: ${v.why}`);
        fail++;
      } else {
        console.log(`    ✅ ${r.len} chars | proto=${v.protocol || 'N/A'} | hints=${JSON.stringify(v.hints || {})}`);
        pass++;
      }

      // ★ 记录到报告
      reporter.record({
        queryId: id,
        phase,
        query,
        expectedProtocol,
        expectedDesc: opts.expectedDesc || '',
        actualResponse: r.body,
        actualLen: r.len,
        verdict: v,
        durationMs: elapsed,
      });
    } catch (e) {
      console.log(`    ❌ ${e.message}`);
      fail++;
      reporter.record({
        queryId: id,
        phase,
        query,
        expectedProtocol,
        expectedDesc: opts.expectedDesc || '',
        actualResponse: '',
        actualLen: 0,
        verdict: { pass: false, why: e.message },
        durationMs: Date.now() - startTime,
        error: e.message,
      });
      await page.waitForTimeout(2000);
    }
  }

  // ═══════════════════════════════════════
  // Phase 2: 基础查询
  // ═══════════════════════════════════════
  const PHASE2_NAME = 'Phase 2: 基础查询';
  console.log(`\n── ${PHASE2_NAME} ──`);
  // TEST-001: 指定地址 → DETAIL
  for (const t of config.phase2.filter(t => t.id.startsWith('TEST-001') || t.id.startsWith('TEST-002') || t.id === 'EXTRA-002')) {
    const isDetail = /\d+ [A-Z]/.test(t.q); // 含具体地址
    if (isDetail) {
      const propName = t.q.match(/(\d+ [A-Z]\w+ [A-Z]\w+)/)?.[1] || '';
      await ask(t.id, t.q, (body) => verifyDetail(body, t.id, propName), {
        waitSec: t.w,
        phase: PHASE2_NAME,
        expectedProtocol: 'detail',
        expectedDesc: `返回 ${propName || '物业'} 的详细信息（户型/价格/设施等）`,
      });
    } else {
      await ask(t.id, t.q, (body) => verifySearch(body, t.id), {
        waitSec: t.w,
        phase: PHASE2_NAME,
        expectedProtocol: 'search',
        expectedDesc: '返回符合条件的房源列表（含价格/地址/房源卡片）',
      });
    }
  }
  // TEST-003/004: 城市搜索 + EXTRA
  for (const t of config.phase2.filter(t => !t.id.startsWith('TEST-001') && !t.id.startsWith('TEST-002') && t.id !== 'EXTRA-002')) {
    await ask(t.id, t.q, (body) => verifySearch(body, t.id), {
      waitSec: t.w,
      phase: PHASE2_NAME,
      expectedProtocol: 'search',
      expectedDesc: '返回房源列表或反问澄清信息',
    });
  }

  // ═══════════════════════════════════════
  // Phase 3: 多城市
  // ═══════════════════════════════════════
  const PHASE3_NAME = 'Phase 3: 多城市采集';
  console.log(`\n── ${PHASE3_NAME} ──`);
  for (const city of config.phase3) {
    if (city.useSelector) {
      try {
        await page.getByTestId('composer-location').click();
        await page.waitForTimeout(500);
        await page.getByRole('option', { name: city.useSelector }).click();
        await page.waitForTimeout(300);
      } catch (e) {
        console.log(`    ⚠️ City selector failed: ${e.message}`);
      }
    }
    await ask(`P3-${city.name}`, city.q, (body) => verifySearch(body, `P3-${city.name}`), {
      waitSec: 12,
      phase: PHASE3_NAME,
      expectedProtocol: 'search',
      expectedDesc: `返回 ${city.name} 区域的房源列表`,
    });
  }

  // ═══════════════════════════════════════
  // Phase 4: 扩展对话 (含 COMPARE / FOLLOW_UP / SEARCH)
  // ═══════════════════════════════════════
  const PHASE4_NAME = 'Phase 4: 扩展对话';
  console.log(`\n── ${PHASE4_NAME} ──`);
  const extendedOpts = {
    'TC-005': { verify: (b) => verifyComparison(b, 'TC-005', 'Berkeley', 'Seattle'), expectedProtocol: 'compare', expectedDesc: '对比 Berkeley 与 Seattle 的生活成本，给出推荐' },
    'TC-006': { verify: (b) => verifySearch(b, 'TC-006'), expectedProtocol: 'search', expectedDesc: '返回含洗衣机/烘干机的房源列表' },
    'TC-007': { verify: (b) => verifySearch(b, 'TC-007'), expectedProtocol: 'search', expectedDesc: '返回2周内可入住的房源列表' },
    'TC-008': { verify: (b) => verifyDetail(b, 'TC-008', 'pet'), expectedProtocol: 'knowledge', expectedDesc: '说明宠物费用和限制政策' },
    'TC-009': { verify: (b) => verifyFollowUp(b, 'TC-009'), expectedProtocol: 'followup', expectedDesc: '反问具体城市或区域以便推荐安全社区' },
    'TC-010': { verify: (b) => verifyDetail(b, 'TC-010', 'utilities'), expectedProtocol: 'knowledge', expectedDesc: '说明水电费等额外成本和总月费' },
    'TC-011': { verify: (b) => verifySearch(b, 'TC-011'), expectedProtocol: 'search', expectedDesc: '返回短租/月租公寓列表' },
    'TC-012': { verify: (b) => verifySearch(b, 'TC-012'), expectedProtocol: 'search', expectedDesc: '返回当前最便宜的1居室公寓' },
  };
  for (const t of config.phase4) {
    const o = extendedOpts[t.id] || { verify: (b) => verifySearch(b, `P4-${t.id}`), expectedProtocol: 'search', expectedDesc: '返回相关搜索结果' };
    await ask(`P4-${t.id}`, t.q, o.verify, {
      phase: PHASE4_NAME,
      expectedProtocol: o.expectedProtocol,
      expectedDesc: o.expectedDesc,
    });
  }

  // ═══════════════════════════════════════
  // Phase 5: 物业详情 → DETAIL
  // ═══════════════════════════════════════
  const PHASE5_NAME = 'Phase 5: 物业详情';
  console.log(`\n── ${PHASE5_NAME} ──`);
  for (const t of config.phase5) {
    // 提取房源名
    const propMatch = t.q.match(/([\d]+ [A-Z]\w+ [A-Z]\w+ [A-Z]\w+)/) // 2315 College Avenue
      || t.q.match(/(The Grey House|Nari Koreatown)/i);
    const propName = propMatch ? propMatch[1] : '';
    const isCompare = /compare|vs/i.test(t.q);
    await ask(`P5-${t.id}`, t.q,
      isCompare
        ? (b) => verifyComparison(b, `P5-${t.id}`, '2315 College', '2618 College')
        : (b) => verifyDetail(b, `P5-${t.id}`, propName),
      {
        phase: PHASE5_NAME,
        expectedProtocol: isCompare ? 'compare' : 'detail',
        expectedDesc: isCompare ? `对比 2315 College 和 2618 College 的可用房源` : `返回 ${propName || '物业'} 的详情（户型/价格/入住时间）`,
      }
    );
  }

  // ★ 写入报告文件
  const reportPath = reporter.flush();
  const summary = reporter.summary();

  console.log(`\n✅ Search 完成: ${pass} passed, ${fail} failed (${pass + fail} total)`);
  console.log(`📄 AI Chat 报告已写入: ${reportPath}`);
  console.log(`📊 报告汇总: ${summary.total} 条 | ✅ ${summary.passed} | ❌ ${summary.failed}`);

  expect.soft(fail, `AI chat 查询中有 ${fail} 条失败（详见 ${reportPath}）`).toBe(0);
});
