const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { startRun, subscribeToRun, stopRun } = require('../runner');
const db = require('../db');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ================================================================
// 扫描 tests/cases/ 下的所有 .test.js 文件
// ================================================================
function scanTestFiles() {
  const casesDir = path.join(PROJECT_ROOT, 'tests', 'cases');
  if (!fs.existsSync(casesDir)) return [];
  const results = [];

  function walk(dir, moduleName) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, entry.name);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        const relative = path.relative(casesDir, fullPath);
        results.push({
          module: moduleName || path.dirname(relative),
          fileName: entry.name,
          filePath: relative.replace(/\\/g, '/'),
          fullPath: fullPath,
        });
      }
    }
  }

  walk(casesDir, '');
  return results;
}

// GET /api/cases — 列出所有用例
router.get('/', (req, res) => {
  const files = scanTestFiles();
  res.json(files);
});

// POST /api/runs — 启动用例执行
router.post('/runs', (req, res) => {
  const { files } = req.body; // ['tests/cases/login/Login-004.test.js']

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: '请选择至少一个测试文件' });
  }

  const testPaths = files.map((f) => path.join(PROJECT_ROOT, 'tests', 'cases', f));
  for (const tp of testPaths) {
    if (!fs.existsSync(tp)) {
      return res.status(400).json({ error: `文件不存在: ${tp}` });
    }
  }

  const { runId } = startRun(files.map((f) => `tests/cases/${f}`));
  res.json({ runId });
});

// GET /api/runs/:id/stream — SSE 实时输出
router.get('/runs/:id/stream', (req, res) => {
  subscribeToRun(parseInt(req.params.id), res);
});

// POST /api/runs/:id/stop — 停止运行
router.post('/runs/:id/stop', (req, res) => {
  const stopped = stopRun(parseInt(req.params.id));
  res.json({ stopped });
});

module.exports = router;
