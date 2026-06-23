const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { startRun, subscribeToRun, stopRun } = require('../runner');
const { startPytestRun, subscribeToRun: subscribeToPyRun, stopRun: stopPyRun } = require('../runner-python');
const db = require('../db');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ================================================================
// 扫描 tests/cases/ 和 tests/pytest/cases/ 下的所有测试文件
// ================================================================
function scanTestFiles() {
  const jsDir = path.join(PROJECT_ROOT, 'tests', 'cases');
  const pyDir = path.join(PROJECT_ROOT, 'tests', 'pytest', 'cases');
  const results = [];

  // 扫描 JS 文件
  function walkJS(dir, moduleName) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkJS(fullPath, entry.name);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        const relative = path.relative(jsDir, fullPath);
        results.push({
          module: moduleName || path.dirname(relative),
          fileName: entry.name,
          filePath: relative.replace(/\\/g, '/'),
          fullPath,
          language: 'js',
        });
      }
    }
  }

  // 扫描 Python 文件
  function walkPy(dir, moduleName) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkPy(fullPath, entry.name);
      } else if (entry.isFile() && entry.name.endsWith('.py') && !entry.name.startsWith('__')) {
        const relative = path.relative(pyDir, fullPath);
        results.push({
          module: '[py] ' + (moduleName || path.dirname(relative)),
          fileName: entry.name,
          filePath: 'pytest/' + relative.replace(/\\/g, '/'),
          fullPath,
          language: 'py',
        });
      }
    }
  }

  walkJS(jsDir, '');
  walkPy(pyDir, '');
  return results;
}

// GET /api/cases — 列出所有用例
router.get('/', (req, res) => {
  const files = scanTestFiles();
  res.json(files);
});

// POST /api/runs — 启动用例执行
router.post('/runs', (req, res) => {
  const { files } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: '请选择至少一个测试文件' });
  }

  // 分离 JS 和 Python 文件
  const jsFiles = files.filter(f => f.endsWith('.test.js'));
  const pyFiles = files.filter(f => f.endsWith('.py'));

  if (pyFiles.length > 0 && jsFiles.length === 0) {
    // 纯 Python → pytest
    const testPaths = pyFiles.map(f => f.replace(/^pytest\//, ''));
    const { runId } = startPytestRun(testPaths, 'py');
    return res.json({ runId, language: 'py' });
  }

  if (jsFiles.length > 0 && pyFiles.length === 0) {
    // 纯 JS → playwright test
    const testPaths = jsFiles.map(f => `tests/cases/${f}`);
    for (const tp of testPaths) {
      const absPath = path.join(PROJECT_ROOT, tp);
      if (!fs.existsSync(absPath)) {
        return res.status(400).json({ error: `文件不存在: ${tp}` });
      }
    }
    const { runId } = startRun(jsFiles.map(f => `tests/cases/${f}`));
    return res.json({ runId, language: 'js' });
  }

  // 混合：暂不允许（避免竞态）
  return res.status(400).json({
    error: '不支持同时运行 JS 和 Python 测试，请分开选择运行',
  });
});

// GET /api/runs/:id/stream — SSE 实时输出
router.get('/runs/:id/stream', (req, res) => {
  // 尝试 JS runner 和 Python runner
  const runId = parseInt(req.params.id);
  // 先尝试 Python runner 的 subscribe
  subscribeToPyRun(runId, res);
});

// POST /api/runs/:id/stop — 停止运行
router.post('/runs/:id/stop', (req, res) => {
  const runId = parseInt(req.params.id);
  let stopped = stopRun(runId);
  if (!stopped) stopped = stopPyRun(runId);
  res.json({ stopped });
});

module.exports = router;
