const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RESULTS_JSON = path.join(PROJECT_ROOT, 'tests', 'report', 'results.json');
const REPORT_DIR = path.join(PROJECT_ROOT, 'tests', 'report');
const AICHAT_RESULTS = path.join(REPORT_DIR, 'aichat-results.json');

const runStreams = new Map();

/**
 * 清理上次运行的日志和产物
 */
function cleanBeforeRun() {
  const dirsToClean = [
    path.join(REPORT_DIR, 'screenshots'),
    path.join(REPORT_DIR, 'artifacts'),
    path.join(REPORT_DIR, 'html'),
  ];

  const filesToRemove = [RESULTS_JSON, AICHAT_RESULTS, path.join(REPORT_DIR, 'results.json')];

  // 清理目录内容
  for (const dir of dirsToClean) {
    try {
      if (fs.existsSync(dir)) {
        for (const entry of fs.readdirSync(dir)) {
          const entryPath = path.join(dir, entry);
          try {
            fs.rmSync(entryPath, { recursive: true, force: true });
          } catch (_) { /* 删除失败跳过 */ }
        }
      }
    } catch (_) { /* 目录读取失败跳过 */ }
  }

  // 删除结果文件
  for (const fn of filesToRemove) {
    try {
      if (fs.existsSync(fn)) fs.unlinkSync(fn);
    } catch (_) { /* 删除失败跳过 */ }
  }
}

/**
 * 启动 Playwright 测试
 */
function startRun(testFiles) {
  // ★ 每次运行前自动清理旧日志和产物
  cleanBeforeRun();

  const runId = db.createRun();

  if (fs.existsSync(RESULTS_JSON)) {
    fs.unlinkSync(RESULTS_JSON);
  }

  const testArgs = testFiles.join(' ');
  const command = `npx playwright test ${testArgs} --project=chromium`;
  const child = spawn(command, [], {
    cwd: PROJECT_ROOT,
    shell: true,
    env: { ...process.env },
  });

  const runCtx = { connections: new Set(), process: child, logs: [] };
  runStreams.set(runId, runCtx);

  function broadcast(type, data) {
    const msg = JSON.stringify({ type, data });
    runCtx.logs.push(msg);
    for (const res of runCtx.connections) {
      try { res.write(`data: ${msg}\n\n`); } catch (_) { /* ignore */ }
    }
  }

  function parseAndSaveResults() {
    try {
      const raw = fs.readFileSync(RESULTS_JSON, 'utf-8');
      const report = JSON.parse(raw);

      let total = 0, passed = 0, failed = 0;

      for (const suite of report.suites || []) {
        for (const spec of suite.specs || []) {
          for (const t of spec.tests || []) {
            total++;
            const status = t.status === 'expected' ? 'passed' : 'failed';
            if (status === 'passed') passed++;
            else failed++;

            const result = t.results?.[0] || {};
            const errorObj = result.error || {};

            // 插入结果并获得 resultId
            const resultId = db.insertResult(runId, {
              file_path: suite.file,
              test_name: spec.title,
              status,
              duration_ms: result.duration || 0,
              error_message: result.error?.message || null,
              error_stack: result.error?.stack?.split('\n').slice(1).join('\n') || null,
              screenshot_path: null,
            });

            // 解析附件中的截图
            const attachments = result.attachments || [];
            for (const att of attachments) {
              const attPath = att.path || '';
              if (attPath.endsWith('.png') || attPath.endsWith('.jpg') || attPath.endsWith('.jpeg')) {
                db.insertScreenshot(runId, resultId, attPath, att.name || null);
              }
            }
          }
        }
      }

      db.finishRun(runId, failed > 0 ? 'failed' : 'passed', { total, passed, failed });

      // ★ 导入 AI Chat 查询结果
      importAIChatResults(runId);

      broadcast('done', { status: failed > 0 ? 'failed' : 'passed', total, passed, failed });
    } catch (e) {
      broadcast('error', `解析结果失败: ${e.message}`);
      db.finishRun(runId, 'error', { total: 0, passed: 0, failed: 0 });
    }
  }

  child.stdout.on('data', (chunk) => {
    const lines = chunk.toString().replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    for (const line of lines) {
      broadcast('stdout', line);
      // 也写入数据库日志表
      db.insertLog(runId, 'stdout', line);
    }
  });

  child.stderr.on('data', (chunk) => {
    const lines = chunk.toString().replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    for (const line of lines) {
      broadcast('stderr', line);
      db.insertLog(runId, 'stderr', line);
    }
  });

  child.on('error', (err) => {
    broadcast('error', err.message);
    db.insertLog(runId, 'stderr', err.message);
  });

  child.on('close', (code) => {
    // Playwright 进程退出后 results.json 可能还在写入，等 1 秒再开始检测
    setTimeout(() => {
      let attempts = 0;
      const maxAttempts = 30;

      const pollInterval = setInterval(() => {
        attempts++;
        if (fs.existsSync(RESULTS_JSON)) {
          // 读前再等 500ms 确保写完
          setTimeout(() => {
            clearInterval(pollInterval);
            parseAndSaveResults();
          }, 500);
          return;
        }
        // 超过最大尝试次数，标记完成
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          db.finishRun(runId, 'error', { total: 0, passed: 0, failed: 0 });
          importAIChatResults(runId);
          broadcast('done', { status: 'error', total: 0, passed: 0, failed: 0 });
        }
      }, 1000);
    }, 1000);
  });

  return { runId };
}

function subscribeToRun(runId, res) {
  const ctx = runStreams.get(runId);

  if (!ctx) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'done', data: { status: 'completed' } })}\n\n`);
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  for (const msg of ctx.logs) {
    res.write(`data: ${msg}\n\n`);
  }

  ctx.connections.add(res);

  res.on('close', () => {
    ctx.connections.delete(res);
  });
}

function stopRun(runId) {
  const ctx = runStreams.get(runId);
  if (ctx && ctx.process && !ctx.process.killed) {
    ctx.process.kill('SIGTERM');
    return true;
  }
  return false;
}

/**
 * 将 aichat-results.json 导入数据库
 */
function importAIChatResults(runId) {
  try {
    if (!fs.existsSync(AICHAT_RESULTS)) return;
    const raw = fs.readFileSync(AICHAT_RESULTS, 'utf-8');
    const report = JSON.parse(raw);
    const records = report.all || [];
    if (!Array.isArray(records) || records.length === 0) return;

    let imported = 0;
    for (const entry of records) {
      db.insertAIChatResult(runId, entry);
      imported++;
    }
    console.log(`📊 已导入 ${imported} 条 AI Chat 查询结果`);
  } catch (e) {
    console.error(`导入 AI Chat 结果失败: ${e.message}`);
  }
}

module.exports = { startRun, subscribeToRun, stopRun };
