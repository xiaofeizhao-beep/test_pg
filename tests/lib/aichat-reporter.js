/**
 * aichat-reporter.js — AI Chat 测试报告器
 *
 * 功能:
 *   1. 在测试运行时记录每条查询的结果
 *   2. 记录预期的协议类型、实际回复（截取）、校验结果、特征提示
 *   3. 测试结束时写入 JSON 报告文件
 *   4. 提供 summary() 供 expect.soft 最终断言
 *
 * 输出文件: tests/report/aichat-results-<timestamp>.json
 */

const path = require('path');
const fs = require('fs');

const REPORT_DIR = path.resolve(process.cwd(), 'tests', 'report');
const OUTPUT_FILE = path.join(REPORT_DIR, 'aichat-results.json');

// 协议中文名映射
const PROTOCOL_LABELS = {
  list: '列表 (SEARCH)',
  text: '文本 (DETAIL/KNOWLEDGE/COMPARE)',
  action: '流程 (ACTION)',
};

/**
 * 创建报告器实例
 */
function createReporter() {
  const records = [];

  const reporter = {
    /**
     * 记录一条 AI Chat 查询结果
     * @param {object} entry
     * @param {string} entry.queryId       — 查询编号 (如 "P2-001a")
     * @param {string} entry.phase         — 阶段名 (如 "Phase 2: 基础查询")
     * @param {string} entry.query         — 用户输入的查询文本
     * @param {string} entry.expectedProtocol — 预期协议: "search"|"detail"|"knowledge"|"action"|"compare"|"followup"
     * @param {string} entry.expectedDesc  — 预期回复的一句话描述
     * @param {string} entry.actualResponse — AI 实际回复 (截取前 500 字符)
     * @param {number} entry.actualLen     — 实际回复总长度
     * @param {object} entry.verdict       — 校验器返回的完整结果 { pass, why, hints, ... }
     * @param {number} entry.durationMs    — 等待回复耗时
     * @param {string} entry.error         — 如果有异常，异常消息
     */
    record(entry) {
      const v = entry.verdict || {};
      records.push({
        queryId: entry.queryId || '?',
        phase: entry.phase || '',
        query: entry.query,
        expectedProtocol: entry.expectedProtocol,
        expectedDesc: entry.expectedDesc || '',
        actualResponse: (entry.actualResponse || '').slice(0, 500),  // 前 500 字符预览
        actualLen: entry.actualLen || 0,
        verdict: {
          pass: v.pass !== false,
          protocol: v.protocol || entry.expectedProtocol || 'unknown',
          protocolLabel: PROTOCOL_LABELS[v.protocol] || '未知',
          why: v.why || (entry.error || ''),
          hints: v.hints || {},
        },
        durationMs: entry.durationMs || 0,
        error: entry.error || null,
        timestamp: new Date().toISOString(),
      });
    },

    /** 获取所有记录 */
    all() { return records; },

    /** 按阶段分组 */
    byPhase() {
      const groups = {};
      for (const r of records) {
        const phase = r.phase || '默认';
        if (!groups[phase]) groups[phase] = [];
        groups[phase].push(r);
      }
      return groups;
    },

    /** 汇总统计 */
    summary() {
      const total = records.length;
      const passed = records.filter(r => r.verdict.pass).length;
      const failed = records.filter(r => !r.verdict.pass).length;
      return { total, passed, failed };
    },

    /** 写入 JSON 报告文件 */
    flush() {
      if (!fs.existsSync(REPORT_DIR)) {
        fs.mkdirSync(REPORT_DIR, { recursive: true });
      }
      const report = {
        generatedAt: new Date().toISOString(),
        summary: this.summary(),
        byPhase: this.byPhase(),
        all: records,
      };
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf-8');
      return OUTPUT_FILE;
    },
  };

  return reporter;
}

module.exports = { createReporter, OUTPUT_FILE };
