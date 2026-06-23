"""
reporter.py — AI Chat 测试报告器

功能:
    1. 在测试运行时记录每条查询的结果
    2. 记录预期的协议类型、实际回复（截取）、校验结果、特征提示
    3. 测试结束时写入 JSON 报告文件
    4. 提供 summary() 供最终断言

输出文件: tests/report/aichat-results-pytest.json

对应 tests/lib/aichat-reporter.js
"""

import json
import os
from datetime import datetime
from pathlib import Path

REPORT_DIR = Path(os.getcwd()) / 'tests' / 'report'
OUTPUT_FILE = str(REPORT_DIR / 'aichat-results-pytest.json')

# 协议中文名映射
PROTOCOL_LABELS = {
    'list': '列表 (SEARCH)',
    'text': '文本 (DETAIL/KNOWLEDGE/COMPARE)',
    'action': '流程 (ACTION)',
}


class AIChatReporter:
    """AI Chat 查询结果报告器"""

    def __init__(self):
        self.records = []

    def record(self, entry: dict) -> None:
        """
        记录一条 AI Chat 查询结果

        entry 字段:
            query_id: str       — 查询编号
            phase: str          — 阶段名
            query: str          — 查询文本
            expected_protocol: str — 预期协议
            expected_desc: str  — 预期描述
            actual_response: str — 实际回复
            actual_len: int     — 实际回复长度
            verdict: dict       — 校验器返回结果
            duration_ms: int    — 等待耗时
            error: str|None     — 异常信息
        """
        v = entry.get('verdict', {})
        self.records.append({
            'queryId': entry.get('query_id', '?'),
            'phase': entry.get('phase', ''),
            'query': entry.get('query', ''),
            'expectedProtocol': entry.get('expected_protocol', ''),
            'expectedDesc': entry.get('expected_desc', ''),
            'actualResponse': (entry.get('actual_response', '') or '')[:500],
            'actualLen': entry.get('actual_len', 0),
            'verdict': {
                'pass': v.get('pass', True),
                'protocol': v.get('protocol', entry.get('expected_protocol', 'unknown')),
                'protocolLabel': PROTOCOL_LABELS.get(v.get('protocol', ''), '未知'),
                'why': v.get('why', '') or (entry.get('error') or ''),
                'hints': v.get('hints', {}),
            },
            'durationMs': entry.get('duration_ms', 0),
            'error': entry.get('error'),
            'timestamp': datetime.now().isoformat(),
        })

    def all(self) -> list:
        """获取所有记录"""
        return self.records

    def by_phase(self) -> dict:
        """按阶段分组"""
        groups = {}
        for r in self.records:
            phase = r['phase'] or '默认'
            groups.setdefault(phase, []).append(r)
        return groups

    def summary(self) -> dict:
        """汇总统计"""
        total = len(self.records)
        passed = sum(1 for r in self.records if r['verdict']['pass'])
        failed = total - passed
        return {'total': total, 'passed': passed, 'failed': failed}

    def flush(self) -> str:
        """写入 JSON 报告文件"""
        os.makedirs(REPORT_DIR, exist_ok=True)
        report = {
            'generatedAt': datetime.now().isoformat(),
            'summary': self.summary(),
            'byPhase': self.by_phase(),
            'all': self.records,
        }
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        return OUTPUT_FILE
