const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'test_runs.db');

let db = null;

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('保存数据库失败:', e.message);
  }
}

function initDatabase(sqlModule) {
  // 尝试从文件加载已有数据库
  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new sqlModule.Database(new Uint8Array(fileBuffer));
      console.log('已加载已有数据库:', DB_PATH);
    } catch (e) {
      console.warn('加载数据库文件失败，创建新库:', e.message);
      db = new sqlModule.Database();
    }
  } else {
    db = new sqlModule.Database();
  }

  db.run('PRAGMA journal_mode = WAL');

  db.run(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      total INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      trigger TEXT DEFAULT 'manual'
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      file_path TEXT NOT NULL,
      test_name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER,
      error_message TEXT,
      error_stack TEXT,
      screenshot_path TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS test_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      test_result_id INTEGER REFERENCES test_results(id),
      stream TEXT NOT NULL DEFAULT 'stdout',
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS test_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      test_result_id INTEGER REFERENCES test_results(id),
      file_path TEXT NOT NULL,
      step_name TEXT,
      taken_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS aichat_query_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      query_id TEXT NOT NULL,
      phase TEXT,
      query_text TEXT NOT NULL,
      expected_protocol TEXT NOT NULL,
      expected_desc TEXT,
      actual_response TEXT,
      actual_len INTEGER DEFAULT 0,
      verdict_pass INTEGER NOT NULL DEFAULT 0,
      verdict_protocol TEXT,
      verdict_protocol_label TEXT,
      verdict_why TEXT,
      verdict_hints JSON,
      duration_ms INTEGER DEFAULT 0,
      error_message TEXT,
      timestamp TEXT NOT NULL
    );
  `);

  saveDb();
  console.log('数据库表初始化完成');
}

// 工具：将 sql.js 的查询结果转为对象数组
function rowsToObjects(stmt) {
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  return results;
}

function getLastInsertId() {
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.id;
}

// ================================================================
// 公共 API
// ================================================================

function createRun() {
  const now = new Date().toISOString();
  db.run('INSERT INTO test_runs (status, started_at) VALUES (?, ?)', ['running', now]);
  const id = getLastInsertId();
  saveDb();
  return id;
}

function finishRun(runId, status, stats) {
  const endedAt = new Date().toISOString();
  const stmt = db.prepare('SELECT started_at FROM test_runs WHERE id = ?');
  stmt.bind([runId]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  const startedAt = row ? row.started_at : null;
  const durationMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;

  db.run(
    'UPDATE test_runs SET status = ?, ended_at = ?, duration_ms = ?, total = ?, passed = ?, failed = ? WHERE id = ?',
    [status, endedAt, durationMs, stats.total, stats.passed, stats.failed, runId]
  );
  saveDb();
}

function insertResult(runId, result) {
  db.run(
    'INSERT INTO test_results (run_id, file_path, test_name, status, duration_ms, error_message, error_stack, screenshot_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      runId,
      result.file_path,
      result.test_name,
      result.status,
      result.duration_ms || 0,
      result.error_message || null,
      result.error_stack || null,
      result.screenshot_path || null
    ]
  );
  const id = getLastInsertId();
  saveDb();
  return id;
}

function insertLog(runId, stream, text) {
  db.run(
    'INSERT INTO test_logs (run_id, stream, text, timestamp) VALUES (?, ?, ?, ?)',
    [runId, stream, text, new Date().toISOString()]
  );
  saveDb();
}

function insertScreenshot(runId, testResultId, filePath, stepName) {
  db.run(
    'INSERT INTO test_screenshots (run_id, test_result_id, file_path, step_name, taken_at) VALUES (?, ?, ?, ?, ?)',
    [runId, testResultId || null, filePath, stepName || null, new Date().toISOString()]
  );
  saveDb();
}

function insertScreenshotsFromAttachments(runId, attachments) {
  const now = new Date().toISOString();
  for (const att of attachments || []) {
    const p = att.path || '';
    if (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg')) {
      db.run(
        'INSERT INTO test_screenshots (run_id, file_path, step_name, taken_at) VALUES (?, ?, ?, ?)',
        [runId, p, att.name || null, now]
      );
    }
  }
  saveDb();
}

// ================================================================
// 查询
// ================================================================

function getRuns(limit = 20) {
  const stmt = db.prepare('SELECT * FROM test_runs ORDER BY id DESC LIMIT ?');
  stmt.bind([limit]);
  return rowsToObjects(stmt);
}

function getRunById(runId) {
  const stmt = db.prepare('SELECT * FROM test_runs WHERE id = ?');
  stmt.bind([runId]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row || null;
}

function getRunResults(runId) {
  const stmt = db.prepare('SELECT * FROM test_results WHERE run_id = ?');
  stmt.bind([runId]);
  return rowsToObjects(stmt);
}

function getRunLogs(runId) {
  const stmt = db.prepare('SELECT * FROM test_logs WHERE run_id = ? ORDER BY id ASC');
  stmt.bind([runId]);
  return rowsToObjects(stmt);
}

function getRunScreenshots(runId) {
  const stmt = db.prepare('SELECT * FROM test_screenshots WHERE run_id = ? ORDER BY id ASC');
  stmt.bind([runId]);
  return rowsToObjects(stmt);
}

function getRecentRuns(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const stmt = db.prepare(
    "SELECT * FROM test_runs WHERE started_at >= ? AND status != 'running' ORDER BY started_at ASC"
  );
  stmt.bind([since]);
  return rowsToObjects(stmt);
}

function getOverallStats() {
  const totalRuns = db.exec("SELECT COUNT(*) as count FROM test_runs WHERE status != 'running'");
  const totalTests = db.exec("SELECT COALESCE(SUM(total), 0) as total FROM test_runs WHERE status != 'running'");
  const totalPassed = db.exec("SELECT COALESCE(SUM(passed), 0) as total FROM test_runs WHERE status != 'running'");
  const totalFailed = db.exec("SELECT COALESCE(SUM(failed), 0) as total FROM test_runs WHERE status != 'running'");

  return {
    totalRuns: totalRuns[0]?.values?.[0]?.[0] || (() => { const s = db.prepare("SELECT COUNT(*) as count FROM test_runs WHERE status != 'running'"); s.step(); const r = s.getAsObject(); s.free(); return r.count; })(),
    totalTests: totalTests[0]?.values?.[0]?.[0] || 0,
    totalPassed: totalPassed[0]?.values?.[0]?.[0] || 0,
    totalFailed: totalFailed[0]?.values?.[0]?.[0] || 0,
  };
}

// ================================================================
// AI Chat 查询结果
// ================================================================

function insertAIChatResult(runId, entry) {
  db.run(`
    INSERT INTO aichat_query_results
      (run_id, query_id, phase, query_text, expected_protocol, expected_desc,
       actual_response, actual_len, verdict_pass, verdict_protocol,
       verdict_protocol_label, verdict_why, verdict_hints, duration_ms,
       error_message, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    runId,
    entry.queryId || '?',
    entry.phase || '',
    entry.query || '',
    entry.expectedProtocol || '',
    entry.expectedDesc || '',
    entry.actualResponse || '',
    entry.actualLen || 0,
    entry.verdict?.pass ? 1 : 0,
    entry.verdict?.protocol || '',
    entry.verdict?.protocolLabel || '',
    entry.verdict?.why || '',
    JSON.stringify(entry.verdict?.hints || {}),
    entry.durationMs || 0,
    entry.error || null,
    entry.timestamp || new Date().toISOString()
  ]);
  saveDb();
}

function getAIChatResults(runId) {
  const stmt = db.prepare('SELECT * FROM aichat_query_results WHERE run_id = ? ORDER BY id ASC');
  stmt.bind([runId]);
  return rowsToObjects(stmt);
}

function getLatestAIChatResults(limit = 200) {
  const stmt = db.prepare(`
    SELECT a.*, r.started_at as run_started_at, r.status as run_status
    FROM aichat_query_results a
    JOIN test_runs r ON a.run_id = r.id
    ORDER BY a.id DESC
    LIMIT ?
  `);
  stmt.bind([limit]);
  return rowsToObjects(stmt);
}

function getAIChatStats() {
  const total = db.exec('SELECT COUNT(*) as count FROM aichat_query_results');
  const passed = db.exec('SELECT COUNT(*) as count FROM aichat_query_results WHERE verdict_pass = 1');
  const failed = db.exec('SELECT COUNT(*) as count FROM aichat_query_results WHERE verdict_pass = 0');
  const byProtocol = db.exec(`
    SELECT expected_protocol, COUNT(*) as total,
      SUM(CASE WHEN verdict_pass = 1 THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN verdict_pass = 0 THEN 1 ELSE 0 END) as failed
    FROM aichat_query_results
    GROUP BY expected_protocol
    ORDER BY total DESC
  `);
  const byPhase = db.exec(`
    SELECT phase, COUNT(*) as total,
      SUM(CASE WHEN verdict_pass = 1 THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN verdict_pass = 0 THEN 1 ELSE 0 END) as failed
    FROM aichat_query_results
    GROUP BY phase
    ORDER BY total DESC
  `);

  return {
    total: total[0]?.values?.[0]?.[0] || 0,
    passed: passed[0]?.values?.[0]?.[0] || 0,
    failed: failed[0]?.values?.[0]?.[0] || 0,
    byProtocol: byProtocol[0]?.values?.map(r => ({ expected_protocol: r[0], total: r[1], passed: r[2], failed: r[3] })) || [],
    byPhase: byPhase[0]?.values?.map(r => ({ phase: r[0], total: r[1], passed: r[2], failed: r[3] })) || [],
  };
}

// 清理旧测试结果并重建库
function resetDatabase() {
  db.run('DROP TABLE IF EXISTS aichat_query_results');
  db.run('DROP TABLE IF EXISTS test_screenshots');
  db.run('DROP TABLE IF EXISTS test_logs');
  db.run('DROP TABLE IF EXISTS test_results');
  db.run('DROP TABLE IF EXISTS test_runs');

  db.run(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      total INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      trigger TEXT DEFAULT 'manual'
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      file_path TEXT NOT NULL,
      test_name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER,
      error_message TEXT,
      error_stack TEXT,
      screenshot_path TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS test_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      test_result_id INTEGER REFERENCES test_results(id),
      stream TEXT NOT NULL DEFAULT 'stdout',
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS test_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      test_result_id INTEGER REFERENCES test_results(id),
      file_path TEXT NOT NULL,
      step_name TEXT,
      taken_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS aichat_query_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      query_id TEXT NOT NULL,
      phase TEXT,
      query_text TEXT NOT NULL,
      expected_protocol TEXT NOT NULL,
      expected_desc TEXT,
      actual_response TEXT,
      actual_len INTEGER DEFAULT 0,
      verdict_pass INTEGER NOT NULL DEFAULT 0,
      verdict_protocol TEXT,
      verdict_protocol_label TEXT,
      verdict_why TEXT,
      verdict_hints JSON,
      duration_ms INTEGER DEFAULT 0,
      error_message TEXT,
      timestamp TEXT NOT NULL
    );
  `);
  saveDb();
}

// ================================================================
// 删除运行记录（含关联数据 + 图片文件）
// ================================================================

function deleteRun(runId) {
  // 1. 收集关联的截图文件路径
  const screenshotsStmt = db.prepare('SELECT file_path FROM test_screenshots WHERE run_id = ?');
  screenshotsStmt.bind([runId]);
  const screenshots = rowsToObjects(screenshotsStmt);

  const resultsStmt = db.prepare('SELECT screenshot_path FROM test_results WHERE run_id = ? AND screenshot_path IS NOT NULL');
  resultsStmt.bind([runId]);
  const results = rowsToObjects(resultsStmt);

  const filesToDelete = [];
  for (const s of screenshots) {
    if (s.file_path) filesToDelete.push(s.file_path);
  }
  for (const r of results) {
    if (r.screenshot_path && !filesToDelete.includes(r.screenshot_path)) {
      filesToDelete.push(r.screenshot_path);
    }
  }

  // 2. 删除数据库记录
  db.run('DELETE FROM aichat_query_results WHERE run_id = ?', [runId]);
  db.run('DELETE FROM test_screenshots WHERE run_id = ?', [runId]);
  db.run('DELETE FROM test_logs WHERE run_id = ?', [runId]);
  db.run('DELETE FROM test_results WHERE run_id = ?', [runId]);
  db.run('DELETE FROM test_runs WHERE id = ?', [runId]);

  // 3. 删除磁盘上的截图文件
  for (const fp of filesToDelete) {
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (_) { /* 忽略删除失败 */ }
  }

  // 4. 删除 tests/report/screenshots/ 下的所有截图
  const screenshotsDir = path.join(__dirname, '..', 'tests', 'report', 'screenshots');
  if (fs.existsSync(screenshotsDir)) {
    try {
      const files = fs.readdirSync(screenshotsDir);
      for (const f of files) {
        const fp = path.join(screenshotsDir, f);
        if (fs.statSync(fp).isFile() && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))) {
          fs.unlinkSync(fp);
        }
      }
    } catch (_) { /* 忽略 */ }
  }

  // 5. 清理 artifacts
  const artifactsDir = path.join(__dirname, '..', 'tests', 'report', 'artifacts');
  if (fs.existsSync(artifactsDir)) {
    try {
      const dirs = fs.readdirSync(artifactsDir);
      for (const dir of dirs) {
        const dirPath = path.join(artifactsDir, dir);
        if (fs.statSync(dirPath).isDirectory()) {
          const subFiles = fs.readdirSync(dirPath);
          for (const sub of subFiles) {
            const subPath = path.join(dirPath, sub);
            if (fs.statSync(subPath).isDirectory() && sub === 'attachments') {
              const attFiles = fs.readdirSync(subPath);
              for (const attFile of attFiles) {
                const attFilePath = path.join(subPath, attFile);
                if (!filesToDelete.includes(attFilePath) && (attFile.endsWith('.png') || attFile.endsWith('.jpg') || attFile.endsWith('.jpeg'))) {
                  try { fs.unlinkSync(attFilePath); } catch (_) { /* 忽略 */ }
                }
              }
            }
          }
        }
      }
    } catch (_) { /* 忽略 */ }
  }

  saveDb();
  return { deletedFiles: filesToDelete.length };
}

// ================================================================
// 初始化
// ================================================================
let initPromise = null;

function ensureInit() {
  if (!initPromise) {
    initPromise = initSqlJs().then(sqlModule => {
      initDatabase(sqlModule);
    });
  }
  return initPromise;
}

module.exports = {
  ensureInit,
  createRun,
  finishRun,
  insertResult,
  insertLog,
  insertScreenshot,
  insertScreenshotsFromAttachments,
  deleteRun,
  getRuns,
  getRunById,
  getRunResults,
  getRunLogs,
  getRunScreenshots,
  getRecentRuns,
  getOverallStats,
  insertAIChatResult,
  getAIChatResults,
  getLatestAIChatResults,
  getAIChatStats,
  resetDatabase,
};
