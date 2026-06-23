"""
composer.py — AI 对话输入框查找、提交、响应提取

公共工具库，供 tests/pytest/cases/aichat/*.py 使用

对应 tests/lib/composer.js
"""

import time
from playwright.async_api import Page
from .queries import base_url, timeout as config_timeout


async def find_input(page: Page):
    """多策略查找 AI 对话输入框"""
    from playwright.async_api import TimeoutError as PlaywrightTimeout

    strategies = [
        lambda: page.get_by_test_id('composer-nl'),
        lambda: page.locator('input[placeholder*="Ask" i]').first,
        lambda: page.locator('input[placeholder*="anything" i]').first,
        lambda: page.locator('input[type="text"]:visible').first,
        lambda: page.locator('textarea:visible').first,
        lambda: page.locator('[role="textbox"]:visible').first,
        lambda: page.locator('[contenteditable="true"]:visible').first,
    ]
    for strat in strategies:
        try:
            el = strat()
            if await el.is_visible(timeout=2000):
                return el
        except (PlaywrightTimeout, Exception):
            continue
    return None


async def wait_for_ai_response(page: Page, timeout_ms: int = 30000, min_wait_ms: int = 2000):
    """等待 AI 响应完成 — 双重策略：spinner 消失 + body 文本稳定"""
    start_time = time.time()

    # 记录发送前的 body 长度
    pre_len = await page.evaluate('() => document.body?.innerText?.length || 0')

    # 先等最小时间
    await page.wait_for_timeout(min_wait_ms)

    # 策略 1: 等待 spinner 消失
    try:
        await page.wait_for_function('''() => {
            const spinners = document.querySelectorAll(
                '[class*="loading" i], [class*="thinking" i], [class*="spinner" i], [class*="typing" i], [class*="dot" i]'
            );
            for (const s of spinners) {
                if (s.offsetParent !== null && s.offsetParent !== undefined) return false;
            }
            return true;
        }''', timeout=min(8000, timeout_ms - min_wait_ms))
    except Exception:
        pass

    # 策略 2: 兜底 — 等待 body 文本停止增长
    remaining = timeout_ms - int((time.time() - start_time) * 1000)
    if remaining > 2000:
        try:
            await page.wait_for_function(
                f'''({{
                    const preLen = {pre_len};
                    const cur = document.body?.innerText?.length || 0;
                    if (cur - preLen < 50) return false;
                    if (!window.__bodyLenHistory) window.__bodyLenHistory = [];
                    window.__bodyLenHistory.push({{ t: Date.now(), len: cur }});
                    const cutoff = Date.now() - 3000;
                    window.__bodyLenHistory = window.__bodyLenHistory.filter(h => h.t >= cutoff);
                    const recent = window.__bodyLenHistory.filter(h => h.t >= Date.now() - 2000);
                    if (recent.length >= 2) {{
                        const allSame = recent.every(h => h.len === recent[0].len);
                        return allSame;
                    }}
                    return false;
                }})()''',
                timeout=min(remaining, 25000),
                polling=1000,
            )
        except Exception:
            pass

    elapsed = (time.time() - start_time) * 1000
    if elapsed < min_wait_ms:
        await page.wait_for_timeout(min_wait_ms - int(elapsed))


async def clear_input(page: Page, inp):
    """智能清理输入框"""
    await inp.click()
    await page.wait_for_timeout(100)
    await inp.fill('')
    await inp.press('Control+a')
    await inp.press('Backspace')
    await inp.click(click_count=3)
    await inp.press('Backspace')
    await page.wait_for_timeout(150)


async def submit_query(page: Page, query: str,
                       wait_sec: int = 10,
                       fresh_start: bool = False) -> dict:
    """
    提交查询到 AI 对话框
    返回: { body, url, len, ai_messages, query_in_body }
    """
    if fresh_start:
        await page.goto(base_url, wait_until='domcontentloaded', timeout=config_timeout['page_load'])
        await page.wait_for_timeout(3000)

    inp = await find_input(page)

    if not inp and not fresh_start:
        await page.goto(base_url, wait_until='domcontentloaded', timeout=config_timeout['page_load'])
        await page.wait_for_timeout(3000)
        inp = await find_input(page)

    if not inp:
        raise Exception('Cannot find chat input element')

    await clear_input(page, inp)
    await inp.fill(query)
    await page.wait_for_timeout(300)

    # 点击发送或按 Enter
    btn = page.get_by_test_id('composer-search')
    sent = False
    try:
        visible = await btn.is_visible(timeout=1000)
        disabled = await btn.is_disabled() if visible else True
        if visible and not disabled:
            await btn.click()
            sent = True
    except Exception:
        pass
    if not sent:
        await inp.press('Enter')

    await wait_for_ai_response(page, timeout_ms=wait_sec * 1000, min_wait_ms=2000)

    body = await page.evaluate('() => document.body?.innerText?.slice(0, 8000) || ""')
    url = await page.evaluate('() => location.href')
    ai_messages = await extract_ai_response(page)

    return {
        'body': body,
        'url': url,
        'len': len(body),
        'ai_messages': ai_messages,
        'query_in_body': query[:20] in body,
    }


async def extract_ai_response(page: Page) -> list:
    """提取 AI 对话中的结构化消息"""
    return await page.evaluate('''() => {
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
                const role = /\\b(user|human|me|you)\\b/i.test(cls) ? 'user' : 'assistant';
                const links = [...el.querySelectorAll('a[href]')].slice(0, 5).map(a => ({
                    text: a.textContent?.trim()?.slice(0, 80) || '',
                    href: a.href?.slice(0, 200) || '',
                }));
                const hasImages = el.querySelectorAll('img').length > 0;
                const hasMap = el.querySelectorAll('[class*="map"], iframe').length > 0;
                messages.push({ role, text: text.slice(0, 500), links, hasImages, hasMap });
            });
        }
        return messages.slice(0, 20);
    }''')


async def get_page_info(page: Page) -> dict:
    """获取页面基本信息"""
    return await page.evaluate('''() => ({
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim() || '',
        headings: [...document.querySelectorAll('h2,h3')].map(h => h.textContent?.trim()).slice(0, 15),
        bodyLen: document.body?.innerText?.length || 0,
        navLinks: [...document.querySelectorAll('nav a, header a')].slice(0, 10).map(a => ({
            text: a.textContent?.trim(), href: a.href,
        })),
    })''')
