const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/runs — 运行历史列表
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const runs = db.getRuns(limit);
  res.json(runs);
});

// POST /api/runs/:id/delete — 删除运行记录（含截图文件和日志）
router.post('/:id/delete', (req, res) => {
  const run = db.getRunById(parseInt(req.params.id));
  if (!run) return res.status(404).json({ error: '运行记录不存在' });

  const { deletedFiles } = db.deleteRun(parseInt(req.params.id));
  res.json({ success: true, deletedFiles });
});

// GET /api/runs/:id — 单次运行详情（含用例结果、日志、截图）
router.get('/:id', (req, res) => {
  const run = db.getRunById(parseInt(req.params.id));
  if (!run) return res.status(404).json({ error: '运行记录不存在' });

  const results = db.getRunResults(run.id);
  const logs = db.getRunLogs(run.id);
  const screenshots = db.getRunScreenshots(run.id);
  res.json({ run, results, logs, screenshots });
});

module.exports = router;
