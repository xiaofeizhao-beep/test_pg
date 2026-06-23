"""
AIChat-Phase2: 搜索查询连续对话 (pytest 版本)

合并 Phase 2+3+4+5，单 session 串联 ~29 条查询
模拟真实用户在一个聊天框中连续提问

对应 tests/cases/aichat/AIChat-Phase2-Search.test.js
"""

import re
import time
import pytest
from tests.pytest.lib.composer import submit_query, get_page_info
from tests.pytest.lib.queries import base_url, timeout, phase2, phase3, phase4, phase5
from tests.pytest.lib.verifier import (
    verify_search, verify_detail, verify_comparison, verify_follow_up,
)
from tests.pytest.lib.reporter import AIChatReporter

pytestmark = pytest.mark.website

# 用于 async 超时
pytestmark_timeout = pytest.mark.timeout(600)


class TestAIChatSearch:
    """连续搜索对话 (29条查询)"""

    @pytest.mark.asyncio
    async def test_search_pipeline(self, page):
        await page.goto(base_url, wait_until='domcontentloaded', timeout=timeout['page_load'])
        await page.wait_for_timeout(4000)

        reporter = AIChatReporter()
        passed = 0
        failed = 0
        qn = 0

        async def ask(query_id, query, verify_fn, **opts):
            nonlocal qn, passed, failed
            qn += 1
            phase_label = opts.get('phase', 'Search')
            expected_protocol = opts.get('expected_protocol', 'search')
            expected_desc = opts.get('expected_desc', '')
            wait_sec = opts.get('wait_sec', 10)
            start = time.time()

            label = f'[{qn}/29]'
            print(f'\n  {label} {query_id}: "{query[:60]}"')

            try:
                r = await submit_query(page, query, wait_sec=wait_sec)
                elapsed = int((time.time() - start) * 1000)

                v = verify_fn(r['body'])
                if not v['pass']:
                    print(f'    ❌ VERIFY: {v["why"]}')
                    failed += 1
                else:
                    print(f'    ✅ {r["len"]} chars | proto={v.get("protocol", "N/A")} | hints={v.get("hints", {})}')
                    passed += 1

                reporter.record({
                    'query_id': query_id,
                    'phase': phase_label,
                    'query': query,
                    'expected_protocol': expected_protocol,
                    'expected_desc': expected_desc,
                    'actual_response': r['body'],
                    'actual_len': r['len'],
                    'verdict': v,
                    'duration_ms': elapsed,
                })
            except Exception as e:
                print(f'    ❌ {e}')
                failed += 1
                reporter.record({
                    'query_id': query_id,
                    'phase': phase_label,
                    'query': query,
                    'expected_protocol': expected_protocol,
                    'expected_desc': expected_desc,
                    'actual_response': '',
                    'actual_len': 0,
                    'verdict': {'pass': False, 'why': str(e)},
                    'duration_ms': int((time.time() - start) * 1000),
                    'error': str(e),
                })
                await page.wait_for_timeout(2000)

        # ═══════════════════════════════
        # Phase 2: 基础查询
        # ═══════════════════════════════
        phase2_name = 'Phase 2: 基础查询'
        print(f'\n── {phase2_name} ──')

        # Address queries → DETAIL
        addr_ids = {'TEST-001a', 'TEST-001b', 'TEST-002a', 'TEST-002b', 'EXTRA-002'}
        for t in phase2:
            if t['id'] in addr_ids:
                # 含具体地址 -> DETAIL
                m = re.search(r'(\d+ [A-Z]\w+ [A-Z]\w+)', t['q'])
                prop = m.group(1) if m else ''
                await ask(t['id'], t['q'],
                          lambda b, pid=t['id'], pn=prop: verify_detail(b, pid, pn),
                          wait_sec=t['w'], phase=phase2_name,
                          expected_protocol='detail',
                          expected_desc=f'返回 {prop or "物业"} 的详细信息')
            else:
                await ask(t['id'], t['q'],
                          lambda b, pid=t['id']: verify_search(b, pid),
                          wait_sec=t['w'], phase=phase2_name,
                          expected_protocol='search',
                          expected_desc='返回符合条件的房源列表')

        # ═══════════════════════════════
        # Phase 3: 多城市
        # ═══════════════════════════════
        phase3_name = 'Phase 3: 多城市采集'
        print(f'\n── {phase3_name} ──')
        for city in phase3:
            if city.get('useSelector'):
                try:
                    await page.get_by_test_id('composer-location').click()
                    await page.wait_for_timeout(500)
                    await page.get_by_role('option', name=city['useSelector']).first.click()
                    await page.wait_for_timeout(300)
                except Exception as e:
                    print(f'    ⚠️ City selector failed: {e}')

            cid = f'P3-{city["name"]}'
            await ask(cid, city['q'],
                      lambda b, pid=cid: verify_search(b, pid),
                      wait_sec=12, phase=phase3_name,
                      expected_protocol='search',
                      expected_desc=f'返回 {city["name"]} 区域的房源列表')

        # ═══════════════════════════════
        # Phase 4: 扩展对话
        # ═══════════════════════════════
        phase4_name = 'Phase 4: 扩展对话'
        print(f'\n── {phase4_name} ──')
        phase4_opts = {
            'TC-005': {'verify': lambda b: verify_comparison(b, 'TC-005', 'Berkeley', 'Seattle'),
                       'expected_protocol': 'compare',
                       'expected_desc': '对比 Berkeley 与 Seattle 的生活成本'},
            'TC-006': {'verify': lambda b: verify_search(b, 'TC-006'),
                       'expected_protocol': 'search',
                       'expected_desc': '返回含洗衣机/烘干机的房源列表'},
            'TC-007': {'verify': lambda b: verify_search(b, 'TC-007'),
                       'expected_protocol': 'search',
                       'expected_desc': '返回2周内可入住的房源列表'},
            'TC-008': {'verify': lambda b: verify_detail(b, 'TC-008', 'pet'),
                       'expected_protocol': 'knowledge',
                       'expected_desc': '说明宠物费用和限制政策'},
            'TC-009': {'verify': lambda b: verify_follow_up(b, 'TC-009'),
                       'expected_protocol': 'followup',
                       'expected_desc': '反问具体城市或区域以便推荐安全社区'},
            'TC-010': {'verify': lambda b: verify_detail(b, 'TC-010', 'utilities'),
                       'expected_protocol': 'knowledge',
                       'expected_desc': '说明水电费等额外成本和总月费'},
            'TC-011': {'verify': lambda b: verify_search(b, 'TC-011'),
                       'expected_protocol': 'search',
                       'expected_desc': '返回短租/月租公寓列表'},
            'TC-012': {'verify': lambda b: verify_search(b, 'TC-012'),
                       'expected_protocol': 'search',
                       'expected_desc': '返回当前最便宜的1居室公寓'},
        }
        for t in phase4:
            o = phase4_opts.get(t['id'], {
                'verify': lambda b, pid=f'P4-{t["id"]}': verify_search(b, pid),
                'expected_protocol': 'search',
                'expected_desc': '返回相关搜索结果',
            })
            await ask(f'P4-{t["id"]}', t['q'], o['verify'],
                      phase=phase4_name,
                      expected_protocol=o['expected_protocol'],
                      expected_desc=o['expected_desc'])

        # ═══════════════════════════════
        # Phase 5: 物业详情
        # ═══════════════════════════════
        phase5_name = 'Phase 5: 物业详情'
        print(f'\n── {phase5_name} ──')
        for t in phase5:
            m = re.search(r'([\d]+ [A-Z]\w+ [A-Z]\w+ [A-Z]\w+)', t['q'])
            if not m:
                m = re.search(r'(The Grey House|Nari Koreatown)', t['q'], re.IGNORECASE)
            prop = m.group(1) if m else ''
            is_compare = bool(re.search(r'compare|vs', t['q'], re.IGNORECASE))

            if is_compare:
                await ask(f'P5-{t["id"]}', t['q'],
                          lambda b, pid=f'P5-{t["id"]}': verify_comparison(b, pid, '2315 College', '2618 College'),
                          phase=phase5_name,
                          expected_protocol='compare',
                          expected_desc='对比 2315 College 和 2618 College 的可用房源')
            else:
                await ask(f'P5-{t["id"]}', t['q'],
                          lambda b, pid=f'P5-{t["id"]}', pn=prop: verify_detail(b, pid, pn),
                          phase=phase5_name,
                          expected_protocol='detail',
                          expected_desc=f'返回 {prop or "物业"} 的详情')

        # ★ 写入报告
        report_path = reporter.flush()
        summary = reporter.summary()

        print(f'\n✅ Search 完成: {passed} passed, {failed} failed ({passed + failed} total)')
        print(f'📄 AI Chat 报告已写入: {report_path}')
        print(f'📊 报告汇总: {summary["total"]} 条 | ✅ {summary["passed"]} | ❌ {summary["failed"]}')

        assert failed == 0, f'AI chat 查询中有 {failed} 条失败（详见 {report_path}）'
