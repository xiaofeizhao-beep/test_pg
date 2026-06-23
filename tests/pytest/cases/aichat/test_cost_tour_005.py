"""
AIChat-Phase5: 费用/申请/看房预约 (pytest 版本)

对应 tests/cases/aichat/AIChat-Phase5-CostTour.test.js
"""

import time
import pytest
from tests.pytest.lib.composer import submit_query
from tests.pytest.lib.verifier import (
    verify_knowledge, verify_action, verify_comparison, verify_detail,
)
from tests.pytest.lib.reporter import AIChatReporter
from tests.pytest.lib.queries import base_url, timeout, cost_tour_queries

pytestmark = [pytest.mark.website, pytest.mark.slow]

# 每条查询标注协议类型
ALL_QUERIES = cost_tour_queries


class TestAIChatCostTour:
    """费用/申请/看房 (15条查询)"""

    @pytest.mark.asyncio
    async def test_cost_tour_pipeline(self, page):
        await page.goto(base_url, wait_until='domcontentloaded', timeout=timeout['page_load'])
        await page.wait_for_timeout(3000)

        reporter = AIChatReporter()
        passed = 0
        failed = 0

        groups = {
            'Phase5-费用明细': ALL_QUERIES[0:5],
            'Phase5-申请流程': ALL_QUERIES[5:9],
            'Phase5-看房预约': ALL_QUERIES[9:13],
            'Phase5-综合场景': ALL_QUERIES[13:],
        }

        for group_name, queries in groups.items():
            print(f'\n── {group_name} ──')
            for t in queries:
                print(f'  {t["id"]} [{t["proto"]}]: "{t["q"][:50]}"')
                start = time.time()
                try:
                    r = await submit_query(page, t['q'], wait_sec=12)

                    # 按协议类型校验
                    proto = t['proto']
                    if proto == 'knowledge':
                        v = verify_knowledge(r['body'], t['id'], t.get('topics'))
                    elif proto == 'action':
                        v = verify_action(r['body'], t['id'], t.get('actionType', 'general'))
                    elif proto == 'compare':
                        v = verify_comparison(r['body'], t['id'],
                                              t.get('entityA', ''), t.get('entityB', ''))
                    elif proto == 'detail':
                        v = verify_detail(r['body'], t['id'], t.get('propName', ''))
                    else:
                        v = {'pass': len(r['body']) > 100, 'len': len(r['body'])}

                    if not v['pass']:
                        print(f'    ❌ VERIFY: {v["why"]}')
                        failed += 1
                    else:
                        print(f'    ✅ {r["len"]} chars | proto={v.get("protocol", "N/A")} | hints={v.get("hints", {})}')
                        passed += 1

                    reporter.record({
                        'query_id': t['id'],
                        'phase': group_name,
                        'query': t['q'],
                        'expected_protocol': t['proto'],
                        'expected_desc': t.get('expected_desc', ''),
                        'actual_response': r['body'],
                        'actual_len': r['len'],
                        'verdict': v,
                        'duration_ms': int((time.time() - start) * 1000),
                    })
                except Exception as e:
                    print(f'    ❌ {e}')
                    failed += 1
                    reporter.record({
                        'query_id': t['id'],
                        'phase': group_name,
                        'query': t['q'],
                        'expected_protocol': t['proto'],
                        'expected_desc': t.get('expected_desc', ''),
                        'actual_response': '',
                        'actual_len': 0,
                        'verdict': {'pass': False, 'why': str(e)},
                        'duration_ms': int((time.time() - start) * 1000),
                        'error': str(e),
                    })
                    await page.wait_for_timeout(2000)

        # ★ 写入报告
        report_path = reporter.flush()
        summary = reporter.summary()

        print(f'\n✅ CostTour 完成: {passed} passed, {failed} failed')
        print(f'📄 AI Chat 报告已写入: {report_path}')
        print(f'📊 报告汇总: {summary["total"]} 条 | ✅ {summary["passed"]} | ❌ {summary["failed"]}')

        assert failed == 0, f'AI chat 查询中有 {failed} 条失败（详见 {report_path}）'
