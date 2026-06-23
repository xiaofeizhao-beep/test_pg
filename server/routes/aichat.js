const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/aichat/stats — AI Chat 测试总体统计
router.get('/stats', (req, res) => {
  const stats = db.getAIChatStats();
  res.json(stats);
});

// GET /api/aichat/results — 最新 AI Chat 查询结果列表
router.get('/results', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const results = db.getLatestAIChatResults(limit);
  res.json(results);
});

// GET /api/aichat/results/:runId — 某次运行的 AI Chat 查询结果
router.get('/results/:runId', (req, res) => {
  const run = db.getRunById(parseInt(req.params.runId));
  if (!run) return res.status(404).json({ error: '运行记录不存在' });

  const results = db.getAIChatResults(run.id);
  res.json({ run, results });
});

module.exports = router;
