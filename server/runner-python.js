const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PYTEST_RESULTS = path.join(PROJECT_ROOT, 'tests', 'report', 'pytest_results.json');
const AICHAT_RESULTS = path.join(PROJECT_ROOT, 'tests', 'report', 'aichat-results-pytest.json');

const runStreams = new Map();

// ================================================================
// 自动检测 Python 路径
// ================================================================
function findPython() {
  // 尝试常见的 Python 安装路径
  const candidates = [
    'python',                          // PATH 中的 python
    path.join('C:', 'Python314', 'python.exe'),
    path.join('C:', 'Python313', 'python.exe'),
    path.join('C:', 'Python312', 'python.exe'),
    path.join('C:', 'Python311', 'python.exe'),
  ];
  for (const cmd of candidates) {
    try {
      const { execSync } = require('child_process');
      execSync(`"${cmd}" --version`, { stdio: 'ignore' });
      console.log(`🐍 检测到 Python: ${cmd}`);
      return cmd;
    } catch (_) {
      // 继续尝试下一个
    }
  }
  console.warn('⚠️ 未检测到 Python，使用默认 python 命令');
  return 'python'; // 兜底
}

const PYTHON_CMD = findPython();

// 构建子进程环境变量 — 确保 Python 路径在 PATH 中
function buildEnv() {
  const env = { ...process.env };
  const pyDir = path.dirname(PYTHON_CMD);
  const scriptsDir = path.join(pyDir, 'Scripts');
  const pathDirs = [pyDir, scriptsDir];
  const existingPath = env.PATH || env.Path || '';
  // 只添加尚未在 PATH 中的目录
  const pathParts = existingPath.split(path.delimiter).filter(Boolean);
  for (const d of pathDirs) {
    if (!pathParts.some(p => p.toLowerCase() === d.toLowerCase())) {
      pathParts.unshift(d);
    }
  }
  env.PATH = pathParts.join(path.delimiter);
  env.Path = env.PATH; // Windows 同时需要 Path
  return env;
}

const CHILD_ENV = buildEnv();

/**
 * 启动 pytest 测试
 */
function startPytestRun(testFiles, language = 'py') {
  const runId = db.createRun();

  // 构建 pytest 命令（使用 python -m pytest 确保路径正确）
  const fileArgs = testFiles.map(f => `tests/pytest/cases/${f}`);
  console.log('🔧 PYTHON_CMD:', PYTHON_CMD);
  console.log('🔧 测试文件:', fileArgs);
  console.log('🔧 PATH:', (CHILD_ENV.PATH || '').substring(0, 200));
  const child = spawn(PYTHON_CMD, ['-m', 'pytest', ...fileArgs, '-v', '--tb=short'], {
    cwd: PROJECT_ROOT,
    shell: false,
    env: CHILD_ENV,
  });

  const runCtx = {
    connections: new Set(),
    process: child,
    logs: [],
    language,
  };
  runStreams.set(runId, runCtx);

  function broadcast(type, data) {
    const msg = JSON.stringify({ type, data });
    runCtx.logs.push(msg);
    for (const res of runCtx.connections) {
      try { res.write(`data: ${msg}\n\n`); } catch (_) { /* ignore */ }
    }
  }

  let stdoutBuffer = '';
  let stderrBuffer = '';

  child.stdout.on('data', (chunk) => {
    const lines = chunk.toString().replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    for (const line of lines) {
      stdoutBuffer += line + '\n';
      broadcast('stdout', line);
      db.insertLog(runId, 'stdout', line);
    }
  });

  child.stderr.on('data', (chunk) => {
    const lines = chunk.toString().replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    for (const line of lines) {
      stderrBuffer += line + '\n';
      broadcast('stderr', line);
      db.insertLog(runId, 'stderr', line);
    }
  });

  child.on('error', (err) => {
    broadcast('error', err.message);
    db.insertLog(runId, 'stderr', err.message);
  });

  child.on('close', (code) => {
    // 等待 pytest_results.json 生成
    setTimeout(() => {
      let attempts = 0;
      const maxAttempts = 30;

      const pollInterval = setInterval(() => {
        attempts++;
        if (fs.existsSync(PYTEST_RESULTS)) {
          setTimeout(() => {
            clearInterval(pollInterval);
            parsePytestResults(runId, stdoutBuffer);
          }, 500);
          return;
        }
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          // 降级：从 stdout 解析
          parsePytestOutput(runId, stdoutBuffer + '\n' + stderrBuffer);
        }
      }, 1000);
    }, 1000);
  });

  return { runId };
}

/**
 * 解析 pytest JSON 结果文件
 */
function parsePytestResults(runId, stdoutStr) {
  try {
    const raw = fs.readFileSync(PYTEST_RESULTS, 'utf-8');
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

          db.insertResult(runId, {
            file_path: suite.file,
            test_name: spec.title,
            status,
            duration_ms: result.duration || 0,
            error_message: errorObj.message || null,
            error_stack: errorObj.stack || null,
            screenshot_path: null,
          });
        }
      }
    }

    db.finishRun(runId, failed > 0 ? 'failed' : 'passed', { total, passed, failed });
    importAIChatResults(runId);
    broadcastToRun(runId, 'done', { status: failed > 0 ? 'failed' : 'passed', total, passed, failed });
  } catch (e) {
    parsePytestOutput(runId, stdoutStr);
  }
}

/**
 * 降级解析：从 pytest stdout 输出解析结果
 */
function parsePytestOutput(runId, output) {
  try {
    // 解析 pytest 的最终行: "= X passed, Y failed in Zs ="
    const summaryMatch = output.match(/(\d+)\s+passed[,;]?\s*(?:(\d+)\s+failed)?/);
    const passed = parseInt(summaryMatch?.[1]) || 0;
    const failed = parseInt(summaryMatch?.[2]) || 0;
    const total = passed + failed;

    // 解析每条测试
    const testPattern = /^(PASSED|FAILED)\s+(.+?)(?:\s+\[.+?\])?$/gm;
    let match;
    while ((match = testPattern.exec(output)) !== null) {
      const status = match[1] === 'PASSED' ? 'passed' : 'failed';
      const testName = match[2].trim();
      const filePath = testName.split('::')[0] || '';

      db.insertResult(runId, {
        file_path: filePath,
        test_name: testName,
        status,
        duration_ms: 0,
        error_message: status === 'failed' ? '测试失败' : null,
        error_stack: null,
        screenshot_path: null,
      });
    }

    db.finishRun(runId, failed > 0 ? 'failed' : 'passed', { total: total || 1, passed, failed });
    importAIChatResults(runId);
    broadcastToRun(runId, 'done', { status: failed > 0 ? 'failed' : 'passed', total, passed, failed });
  } catch (e) {
    db.finishRun(runId, 'error', { total: 0, passed: 0, failed: 0 });
    broadcastToRun(runId, 'done', { status: 'error', total: 0, passed: 0, failed: 0 });
  }
}

function broadcastToRun(runId, type, data) {
  const ctx = runStreams.get(runId);
  if (!ctx) return;
  const msg = JSON.stringify({ type, data });
  for (const res of ctx.connections) {
    try { res.write(`data: ${msg}\n\n`); } catch (_) { /* ignore */ }
  }
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
 * 将 aichat-results-pytest.json 导入数据库
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
      db.insertAIChatResult(runId, { ...entry, source: 'py' });
      imported++;
    }
    console.log(`📊 已导入 ${imported} 条 Python AI Chat 查询结果`);
  } catch (e) {
    console.error(`导入 Python AI Chat 结果失败: ${e.message}`);
  }
}

module.exports = { startPytestRun, subscribeToRun, stopRun };
