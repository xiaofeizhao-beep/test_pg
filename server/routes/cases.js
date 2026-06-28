const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { startPytestRun, subscribeToRun: subscribeToPyRun, stopRun: stopPyRun } = require('../runner-python');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ================================================================
// 扫描 tests/pytest/cases/ 下的所有测试文件
// ================================================================
function scanTestFiles() {
  const pyDir = path.join(PROJECT_ROOT, 'tests', 'pytest', 'cases');
  const results = [];

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
          module: moduleName || path.dirname(relative),
          fileName: entry.name,
          filePath: relative.replace(/\\/g, '/'),
          fullPath,
          language: 'py',
        });
      }
    }
  }

  walkPy(pyDir, '');
  return results;
}

// GET /api/cases — 列出所有用例
router.get('/', (req, res) => {
  const files = scanTestFiles();
  res.json(files);
});

// POST /api/runs — 启动用例执行（仅 pytest）
router.post('/runs', (req, res) => {
  const { files } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: '请选择至少一个测试文件' });
  }

  // 只接受 Python 文件
  const pyFiles = files.filter(f => f.endsWith('.py'));
  if (pyFiles.length === 0) {
    return res.status(400).json({ error: '仅支持 pytest (.py) 测试文件' });
  }

  const testPaths = pyFiles.map(f => f.replace(/^pytest\//, ''));
  const { runId } = startPytestRun(testPaths, 'py');
  return res.json({ runId, language: 'py' });
});

// GET /api/runs/:id/stream — SSE 实时输出
router.get('/runs/:id/stream', (req, res) => {
  const runId = parseInt(req.params.id);
  subscribeToPyRun(runId, res);
});

// POST /api/runs/:id/stop — 停止运行
router.post('/runs/:id/stop', (req, res) => {
  const runId = parseInt(req.params.id);
  const stopped = stopPyRun(runId);
  res.json({ stopped });
});

module.exports = router;
