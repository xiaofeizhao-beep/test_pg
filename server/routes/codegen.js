const express = require('express');
const router = express.Router();
const codegen = require('../codegen-manager');

// POST /api/codegen/start — 启动录制会话
router.post('/start', (req, res) => {
  const { url, outputPath } = req.body;
  if (!url) return res.status(400).json({ error: '请提供目标 URL' });

  const result = codegen.startSession(url, outputPath);
  res.json(result);
});

// GET /api/codegen/:id/status — 会话状态
router.get('/:id/status', (req, res) => {
  res.json(codegen.getStatus(req.params.id));
});

// GET /api/codegen/:id/code — 获取生成的代码
router.get('/:id/code', (req, res) => {
  res.json(codegen.getGeneratedCode(req.params.id));
});

// POST /api/codegen/:id/postprocess — 后处理
router.post('/:id/postprocess', (req, res) => {
  res.json(codegen.postProcess(req.params.id));
});

// POST /api/codegen/:id/save — 保存到测试目录
router.post('/:id/save', (req, res) => {
  const { moduleName } = req.body;
  res.json(codegen.saveToTestDir(req.params.id, moduleName));
});

// POST /api/codegen/:id/stop — 停止录制
router.post('/:id/stop', (req, res) => {
  res.json(codegen.stopSession(req.params.id));
});

// GET /api/codegen/sessions — 列出所有会话
router.get('/sessions', (req, res) => {
  res.json(codegen.listSessions());
});

module.exports = router;
