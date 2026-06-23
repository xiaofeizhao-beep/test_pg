/**
 * AIChat-Phase3: 多轮对话连续性测试
 *
 * 测试点:
 *   - Session A: 渐进缩小范围 (4 turns) — 上下文过滤
 *   - Session B: 纠错 & 方向改变 (4 turns) — 上下文城市记忆
 *   - Session C: 反问 & 澄清 (3 turns) — verifyFollowUp + verifySearch
 *   - Session D: 上下文记忆 (2 turns) — 长上下文 recall
 */
const { test, expect } = require('../../fixtures/website-fixture');
const { submit } = require('../../lib/composer');
const { createReporter } = require('../../lib/aichat-reporter');
const { verifySearch, verifyFollowUp, verifyDetail } = require('../../lib/verifier');

test.setTimeout(300000);

// 全局报告器（跨 session 共享）
let globalReporter = null;

/**
 * Helper: 提交并记录到报告
 */
async function askAndRecord(page, id, query, verifyFn, opts = {}) {
  const startTime = Date.now();
  const phase = opts.phase || 'Phase3';
  const expectedProtocol = opts.expectedProtocol || 'search';
  const expectedDesc = opts.expectedDesc || '';
  try {
    const r = await submit(page, query, { waitSec: opts.waitSec || 12 });
    const v = verifyFn(r.body);
    console.log(`  ${id}: ${r.len} chars | ${v.pass ? '✅' : '❌ ' + v.why}`);
    globalReporter.record({
      queryId: id, phase, query, expectedProtocol, expectedDesc,
      actualResponse: r.body, actualLen: r.len, verdict: v,
      durationMs: Date.now() - startTime,
    });
    return { r, v };
  } catch (e) {
    console.log(`  ${id}: ❌ ${e.message}`);
    globalReporter.record({
      queryId: id, phase, query, expectedProtocol, expectedDesc,
      actualResponse: '', actualLen: 0,
      verdict: { pass: false, why: e.message },
      durationMs: Date.now() - startTime, error: e.message,
    });
    return { r: { body: '', len: 0 }, v: { pass: false, why: e.message } };
  }
}

test.describe('AIChat Phase 3: Multi-Turn Conversation', () => {
  test.beforeAll(() => {
    globalReporter = createReporter();
  });

  test.afterAll(() => {
    if (globalReporter) {
      const reportPath = globalReporter.flush();
      const s = globalReporter.summary();
      console.log(`\n📄 AI Chat 报告已写入: ${reportPath}`);
      console.log(`📊 Phase3 汇总: ${s.total} 条 | ✅ ${s.passed} | ❌ ${s.failed}`);
    }
  });

  // ═══════════════════════════════════════
  // Session A: 渐进缩小范围
  // ═══════════════════════════════════════
  test('P3-SessionA: 渐进缩小范围 (4 turns)', async ({ page }) => {
    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const PN = 'Phase3-SessionA: 渐进缩小范围';

    await askAndRecord(page, 'A1', 'Show me apartments in Berkeley',
      (b) => verifySearch(b, 'A1'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '返回 Berkeley 区域的房源列表，含价格和地址',
      });

    await askAndRecord(page, 'A2', 'Only show me ones under $2,500',
      (b) => verifySearch(b, 'A2'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '在 Berkeley 上下文下，过滤 $2500 以下的房源',
      });

    await askAndRecord(page, 'A3', 'Actually, I want 1-bedroom only, with in-unit laundry',
      (b) => verifySearch(b, 'A3'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '进一步过滤 1居室+洗衣设施 的房源',
      });

    await askAndRecord(page, 'A4', 'Also needs to be pet friendly, I have a small dog',
      (b) => verifyDetail(b, 'A4', 'pet'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '追加宠物友好过滤，返回含宠物政策的房源',
      });
  });

  // ═══════════════════════════════════════
  // Session B: 纠错 & 方向改变
  // ═══════════════════════════════════════
  test('P3-SessionB: 纠错与方向改变 (4 turns)', async ({ page }) => {
    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const PN = 'Phase3-SessionB: 纠错与方向改变';

    await askAndRecord(page, 'B1', 'Find me a 3-bedroom apartment in Chicago under $4000',
      (b) => verifySearch(b, 'B1'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '返回 Chicago 区域 3居室 $4000以下 房源',
      });

    // 纠错: 改户型 (保留 Chicago 上下文)
    await askAndRecord(page, 'B2', 'Sorry I meant 1-bedroom, not 3-bedroom',
      (b) => verifySearch(b, 'B2'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '继续 Chicago 上下文，户型改为 1居室',
      });

    // 换城市
    await askAndRecord(page, 'B3', 'Actually, let me look in Seattle instead',
      (b) => verifySearch(b, 'B3'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '切换到 Seattle，返回该城市房源',
      });

    // 改变预算
    await askAndRecord(page, 'B4', 'My budget just changed, can we go up to $3,000 max?',
      (b) => verifySearch(b, 'B4'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: 'Seattle 上下文下调整预算至 $3000',
      });
  });

  // ═══════════════════════════════════════
  // Session C: 反问 & 澄清
  // ═══════════════════════════════════════
  test('P3-SessionC: 反问与澄清 (3 turns)', async ({ page }) => {
    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const PN = 'Phase3-SessionC: 反问与澄清';

    // V4 Protocol: 只给 amenity 不给城市 → 期望 FOLLOW_UP 反问缺少的信息
    await askAndRecord(page, 'C1', 'I want an apartment with parking',
      (b) => verifyFollowUp(b, 'C1'), {
        phase: PN, expectedProtocol: 'followup',
        expectedDesc: 'AI 应反问缺失的城市或预算信息 → 预期反问句或提示',
      });

    // 回答城市
    await askAndRecord(page, 'C2', 'In Houston',
      (b) => verifySearch(b, 'C2-Houston'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '返回 Houston 区域含停车位的房源列表',
      });

    // 给预算
    await askAndRecord(page, 'C3', 'Under $1,800 per month',
      (b) => verifySearch(b, 'C3'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '在 Houston 上下文中过滤 $1800 以下房源',
      });
  });

  // ═══════════════════════════════════════
  // Session D: 上下文记忆挑战
  // ═══════════════════════════════════════
  test('P3-SessionD: 上下文记忆 (2 turns)', async ({ page }) => {
    await page.goto('https://website-dev.unitpulse.ai', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const PN = 'Phase3-SessionD: 上下文记忆';

    // 建立复杂上下文
    await askAndRecord(page, 'D1',
      'I am a software engineer working remotely. I need a quiet 2-bedroom in Berkeley with fast internet, near hiking trails, under $3,200.',
      (b) => verifySearch(b, 'D1-Berkeley-2BR'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '返回 Berkeley 2居室 安静 快速网络 近步道 $3200以下 房源',
      });

    // 问一个必须记住上下文的问题
    await askAndRecord(page, 'D2',
      'Great, now what are my commute options to San Francisco from those places?',
      (b) => verifyDetail(b, 'D2', 'commute'), {
        phase: PN, expectedProtocol: 'search',
        expectedDesc: '基于上文提到的 Berkeley 房源，回答到 SF 的通勤选项',
      });
  });
});
