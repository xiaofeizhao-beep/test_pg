const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ================================================================
// 中间件
// ================================================================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ================================================================
// 路由
// ================================================================
const dashboardRoutes = require('./routes/dashboard');
const caseRoutes = require('./routes/cases');
const historyRoutes = require('./routes/history');

app.use('/api', dashboardRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/history', historyRoutes);

// ================================================================
// 页面路由
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
  res.render('dashboard');
});

app.get('/cases', (req, res) => {
  res.render('cases');
});

app.get('/history', (req, res) => {
  res.render('history');
});

// ================================================================
// 截图文件服务（从绝对路径安全读取）
// ================================================================

const PROJECT_ROOT = path.resolve(__dirname, '..');

app.get('/screenshot', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).send('Missing path param');

  // 安全检查：只允许访问 tests/report/ 下的截图
  const resolved = path.resolve(filePath);
  const allowed = path.resolve(PROJECT_ROOT, 'tests', 'report');
  if (!resolved.startsWith(allowed)) {
    return res.status(403).send('Forbidden');
  }

  if (fs.existsSync(resolved)) {
    res.sendFile(resolved);
  } else {
    res.status(404).send('Screenshot not found');
  }
});

// ================================================================
// 启动
// ================================================================
app.listen(PORT, () => {
  console.log(`🚀 测试可视化平台已启动: http://localhost:${PORT}`);
});
