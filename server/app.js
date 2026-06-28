const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');

// ================================================================
// 自动加载 .env 文件（Node.js 原生 env-file 方式）
// ================================================================
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
  console.log('📋 已加载 .env 配置');
}

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
const aichatRoutes = require('./routes/aichat');
const codegenRoutes = require('./routes/codegen');

app.use('/api', dashboardRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/aichat', aichatRoutes);
app.use('/api/codegen', codegenRoutes);

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

app.get('/aichat', (req, res) => {
  res.render('aichat');
});

app.get('/codegen', (req, res) => {
  res.render('codegen');
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
db.ensureInit().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 测试可视化平台已启动: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
