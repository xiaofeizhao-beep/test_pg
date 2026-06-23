/**
 * AIChat-Phase5: 费用/申请/看房预约 (单 session 串联)
 *
 * 测试点 & V4 协议校验:
 *   COST-001~005: 费用明细 → KNOWLEDGE
 *   APPLY-001~004: 申请流程 → KNOWLEDGE
 *   TOUR-001~004: 看房预约 → KNOWLEDGE + ACTION(部分)
 *   COST-006: 比较 → COMPARE
 *   TOUR-005: 申请+看房 → ACTION
 */
const { test, expect } = require('../../fixtures/website-fixture');
const { submit } = require('../../lib/composer');
const { createReporter } = require('../../lib/aichat-reporter');
const {
  verifyKnowledge, verifyAction, verifyComparison, verifyDetail,
} = require('../../lib/verifier');

test.setTimeout(600000);

// 每条查询标注协议类型
const ALL_QUERIES = [
  // 费用明细 — KNOWLEDGE
  { id: 'COST-001', q: 'How much are utilities typically for a 1-bedroom apartment in Berkeley? Electric, water, gas, internet — break it down.', proto: 'knowledge', topics: ['utilities', 'electric', 'water', 'gas', 'internet', 'Berkeley'] },
  { id: 'COST-002', q: 'What is the security deposit usually? First month, last month, any other fees upfront?', proto: 'knowledge', topics: ['deposit', 'month', 'fee', 'upfront'] },
  { id: 'COST-003', q: 'I have a cat, what are the typical pet deposits and monthly pet rent in these apartments?', proto: 'knowledge', topics: ['pet', 'deposit', 'cat', 'rent'] },
  { id: 'COST-004', q: 'Show me the total monthly cost for a 2-bedroom at 2701 Durant Avenue including ALL fees — rent, utilities, parking, pet, everything.', proto: 'detail', propName: '2701 Durant Avenue' },
  { id: 'COST-005', q: 'What parking options are available and how much does parking cost per month in Berkeley apartments?', proto: 'knowledge', topics: ['parking', 'cost', 'Berkeley'] },
  // 申请流程 — KNOWLEDGE
  { id: 'APPLY-001', q: 'How do I apply for an apartment? Walk me through the process step by step.', proto: 'knowledge', topics: ['apply', 'process', 'step'] },
  { id: 'APPLY-002', q: 'What documents do I need to prepare before applying? Do I need pay stubs, bank statements, reference letters?', proto: 'knowledge', topics: ['document', 'pay stub', 'bank', 'reference'] },
  { id: 'APPLY-003', q: 'What are the lease terms? Do you have 6-month, 12-month, or month-to-month options?', proto: 'knowledge', topics: ['lease', 'month', 'term'] },
  { id: 'APPLY-004', q: 'Is there an application fee? How long does approval usually take?', proto: 'knowledge', topics: ['application fee', 'approval'] },
  // 看房预约 — ACTION
  { id: 'TOUR-001', q: 'I want to schedule a tour for 2315 College Avenue in Berkeley. What times are available this week?', proto: 'action', actionType: 'tour' },
  { id: 'TOUR-002', q: 'Can I do a virtual tour instead of in-person? What virtual tour options do you have?', proto: 'knowledge', topics: ['virtual', 'tour', 'in-person'] },
  { id: 'TOUR-003', q: 'I want to see 3 apartments in one afternoon. Can I schedule back-to-back tours? How long is each tour?', proto: 'action', actionType: 'tour' },
  { id: 'TOUR-004', q: 'What should I bring to the tour? What questions should I ask the landlord?', proto: 'knowledge', topics: ['bring', 'tour', 'question', 'landlord'] },
  // 综合 — COMPARE + ACTION
  { id: 'COST-006', q: 'Compare the total cost of living: 1-bedroom in Berkeley vs 1-bedroom in Seattle. Include rent, utilities, parking, and any city-specific costs.', proto: 'compare', entityA: 'Berkeley', entityB: 'Seattle' },
  { id: 'TOUR-005', q: 'I found an apartment I like, I want to apply AND schedule a tour. What do I do first? Can you start the process?', proto: 'action', actionType: 'general' },
];

test('P5-CostTour: 费用/申请/看房 (15 queries in single session)', async ({ page }) => {
  await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  const reporter = createReporter();
  let pass = 0, fail = 0;

  const groups = {
    'Phase5-费用明细': ALL_QUERIES.slice(0, 5),
    'Phase5-申请流程': ALL_QUERIES.slice(5, 9),
    'Phase5-看房预约': ALL_QUERIES.slice(9, 13),
    'Phase5-综合场景': ALL_QUERIES.slice(13),
  };

  for (const [group, queries] of Object.entries(groups)) {
    console.log(`\n── ${group} ──`);
    for (const t of queries) {
      console.log(`  ${t.id} [${t.proto}]: "${t.q.slice(0, 50)}"`);
      const startTime = Date.now();
      try {
        const r = await submit(page, t.q, { waitSec: 12 });

        // 按协议类型校验
        let v;
        switch (t.proto) {
          case 'knowledge':
            v = verifyKnowledge(r.body, t.id, t.topics);
            break;
          case 'action':
            v = verifyAction(r.body, t.id, t.actionType);
            break;
          case 'compare':
            v = verifyComparison(r.body, t.id, t.entityA, t.entityB);
            break;
          case 'detail':
            v = verifyDetail(r.body, t.id, t.propName);
            break;
          default:
            v = { pass: r.len > 100, len: r.len };
        }

        if (!v.pass) {
          console.log(`    ❌ VERIFY: ${v.why}`);
          fail++;
        } else {
          console.log(`    ✅ ${r.len} chars | proto=${v.protocol || 'N/A'} | hints=${JSON.stringify(v.hints || {})}`);
          pass++;
        }

        // ★ 记录到报告
        reporter.record({
          queryId: t.id,
          phase: group,
          query: t.q,
          expectedProtocol: t.proto,
          expectedDesc: t.expectedDesc || '',
          actualResponse: r.body,
          actualLen: r.len,
          verdict: v,
          durationMs: Date.now() - startTime,
        });
      } catch (e) {
        console.log(`    ❌ ${e.message}`);
        fail++;
        reporter.record({
          queryId: t.id,
          phase: group,
          query: t.q,
          expectedProtocol: t.proto,
          expectedDesc: t.expectedDesc || '',
          actualResponse: '',
          actualLen: 0,
          verdict: { pass: false, why: e.message },
          durationMs: Date.now() - startTime,
          error: e.message,
        });
        await page.waitForTimeout(2000);
      }
    }
  }

  // ★ 写入报告文件
  const reportPath = reporter.flush();
  const summary = reporter.summary();

  console.log(`\n✅ CostTour 完成: ${pass} passed, ${fail} failed`);
  console.log(`📄 AI Chat 报告已写入: ${reportPath}`);
  console.log(`📊 报告汇总: ${summary.total} 条 | ✅ ${summary.passed} | ❌ ${summary.failed}`);

  expect.soft(fail, `AI chat 查询中有 ${fail} 条失败（详见 ${reportPath}）`).toBe(0);
});
