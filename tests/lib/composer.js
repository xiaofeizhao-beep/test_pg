/**
 * composer.js — AI 对话输入框查找、提交、响应提取
 *
 * 公共工具库，供 tests/cases/aichat/*.test.js 使用
 */
const config = require('./queries.json');

/**
 * 多策略查找 AI 对话输入框
 */
async function findInput(page) {
  const strats = [
    () => page.getByTestId('composer-nl'),
    () => page.locator('input[placeholder*="Ask" i]'),
    () => page.locator('input[placeholder*="anything" i]'),
    () => page.locator('input[type="text"]:visible').first(),
    () => page.locator('textarea:visible').first(),
    () => page.locator('[role="textbox"]:visible').first(),
    () => page.locator('[contenteditable="true"]:visible').first(),
  ];
  for (const s of strats) {
    try {
      const el = s();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) return el;
    } catch (_) { /* continue */ }
  }
  return null;
}

/**
 * 等待 AI 响应完成 — 双重策略：
 *   1. 优先检测 loading/spinner 消失
 *   2. 兜底检测 body 文本稳定（不再增长）
 */
async function waitForAIResponse(page, { timeoutMs = 30000, minWaitMs = 2000 } = {}) {
  const startTime = Date.now();

  // 记录发送前的 body 长度
  const preLen = await page.evaluate(() => document.body?.innerText?.length || 0);

  // 先等最小时间（保证动画/过渡完成）
  await page.waitForTimeout(minWaitMs);

  // 策略 1: 等待 spinner 消失
  try {
    await page.waitForFunction(() => {
      const spinners = document.querySelectorAll(
        '[class*="loading" i], [class*="thinking" i], [class*="spinner" i], [class*="typing" i], [class*="dot" i]'
      );
      for (const s of spinners) {
        if (s.offsetParent !== null && s.offsetParent !== undefined) return false;
      }
      return true;
    }, { timeout: Math.min(8000, timeoutMs - minWaitMs) });
  } catch (_) { /* spinner still visible, continue with body check */ }

  // 策略 2: 兜底 — 等待 body 文本停止增长（连续 2 秒无变化）
  const remaining = timeoutMs - (Date.now() - startTime);
  if (remaining > 2000) {
    try {
      await page.waitForFunction(
        ({ preLen }) => {
          const cur = document.body?.innerText?.length || 0;
          if (cur - preLen < 50) return false;
          if (!window.__bodyLenHistory) window.__bodyLenHistory = [];
          window.__bodyLenHistory.push({ t: Date.now(), len: cur });
          const cutoff = Date.now() - 3000;
          window.__bodyLenHistory = window.__bodyLenHistory.filter(h => h.t >= cutoff);
          const recent = window.__bodyLenHistory.filter(h => h.t >= Date.now() - 2000);
          if (recent.length >= 2) {
            const allSame = recent.every(h => h.len === recent[0].len);
            return allSame;
          }
          return false;
        },
        { preLen },
        { timeout: Math.min(remaining, 25000), polling: 1000 }
      );
    } catch (_) { /* timeout accepted */ }
  }

  const elapsed = Date.now() - startTime;
  if (elapsed < minWaitMs) await page.waitForTimeout(minWaitMs - elapsed);
}

/**
 * 智能清理输入框
 */
async function clearInput(page, input) {
  await input.click();
  await page.waitForTimeout(100);
  await input.fill('');
  await input.press('Control+a');
  await input.press('Backspace');
  await input.click({ clickCount: 3 });
  await input.press('Backspace');
  await page.waitForTimeout(150);
}

/**
 * 提交查询到 AI 对话框
 * @param {import('@playwright/test').Page} page
 * @param {string} query - 查询文本
 * @param {object} opts
 * @param {number} opts.waitSec - 最大等待秒数 (默认 10)
 * @param {boolean} opts.freshStart - 是否先回首页
 * @returns {{ body: string, url: string, len: number, aiMessages: Array, queryInBody: boolean }}
 */
async function submit(page, query, opts = {}) {
  const { waitSec = 10, freshStart = false } = opts;

  if (freshStart) {
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout.pageLoad });
    await page.waitForTimeout(3000);
  }

  let input = await findInput(page);

  if (!input && !freshStart) {
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout.pageLoad });
    await page.waitForTimeout(3000);
    input = await findInput(page);
  }

  if (!input) throw new Error('Cannot find chat input element');

  await clearInput(page, input);
  await input.fill(query);
  await page.waitForTimeout(300);

  // 点击发送或按 Enter
  const btn = page.getByTestId('composer-search');
  let sent = false;
  try {
    const visible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
    const disabled = visible ? await btn.isDisabled().catch(() => false) : true;
    if (visible && !disabled) {
      await btn.click();
      sent = true;
    }
  } catch (_) { /* fall through */ }
  if (!sent) {
    await input.press('Enter');
  }

  await waitForAIResponse(page, { timeoutMs: waitSec * 1000, minWaitMs: 2000 });

  const body = await page.evaluate(() => document.body?.innerText?.slice(0, 8000) || '');
  const url = await page.evaluate(() => location.href);
  const aiMessages = await extractAIResponse(page);

  return {
    body,
    url,
    len: body.length,
    aiMessages,
    queryInBody: body.includes(query.slice(0, 20)),
  };
}

/**
 * 提取 AI 对话中的结构化消息
 */
async function extractAIResponse(page) {
  return await page.evaluate(() => {
    const messages = [];
    const selectors = [
      '[class*="message" i]', '[class*="bubble" i]', '[class*="response" i]',
      '[class*="chat" i] [class*="item" i]', '[class*="turn" i]',
      '[data-testid*="message" i]', '[role="listitem"]',
    ];
    const seen = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        const text = el.textContent?.trim();
        if (!text || text.length < 5) return;
        const cls = el.className?.toString() || '';
        const role = /\b(user|human|me|you)\b/i.test(cls) ? 'user' : 'assistant';
        const links = [...el.querySelectorAll('a[href]')].slice(0, 5).map(a => ({
          text: a.textContent?.trim()?.slice(0, 80) || '',
          href: a.href?.slice(0, 200) || '',
        }));
        const hasImages = el.querySelectorAll('img').length;
        const hasMap = el.querySelectorAll('[class*="map"], iframe').length;
        messages.push({ role, text: text.slice(0, 500), links, hasImages: hasImages > 0, hasMap: hasMap > 0 });
      });
    }
    return messages.slice(0, 20);
  });
}

/**
 * 获取页面基本信息
 */
async function getPageInfo(page) {
  return await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim() || '',
    headings: [...document.querySelectorAll('h2,h3')].map(h => h.textContent?.trim()).slice(0, 15),
    bodyLen: document.body?.innerText?.length || 0,
    navLinks: [...document.querySelectorAll('nav a, header a')].slice(0, 10).map(a => ({
      text: a.textContent?.trim(), href: a.href,
    })),
  }));
}

module.exports = { findInput, waitForAIResponse, clearInput, submit, extractAIResponse, getPageInfo };
