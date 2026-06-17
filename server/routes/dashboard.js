const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/stats — 总览统计
router.get('/stats', (req, res) => {
  const stats = db.getOverallStats();
  const recent = db.getRecentRuns(30);
  res.json({ stats, recent });
});

module.exports = router;
