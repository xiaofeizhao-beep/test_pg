const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RESULTS_JSON = path.join(PROJECT_ROOT, 'tests', 'report', 'results.json');

const runStreams = new Map();

/**
 * 启动 Playwright 测试
 */
function startRun(testFiles) {
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

  child.on('close', () => {
    const pollInterval = setInterval(() => {
      if (fs.existsSync(RESULTS_JSON)) {
        clearInterval(pollInterval);
        parseAndSaveResults();
      }
    }, 300);

    setTimeout(() => {
      clearInterval(pollInterval);
      if (fs.existsSync(RESULTS_JSON)) {
        parseAndSaveResults();
      } else {
        db.finishRun(runId, 'error', { total: 0, passed: 0, failed: 0 });
        broadcast('done', { status: 'error', total: 0, passed: 0, failed: 0 });
      }
    }, 30000);
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

module.exports = { startRun, subscribeToRun, stopRun };
