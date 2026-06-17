const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'test_runs.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
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

  CREATE TABLE IF NOT EXISTS test_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES test_runs(id),
    test_result_id INTEGER REFERENCES test_results(id),
    stream TEXT NOT NULL DEFAULT 'stdout',
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS test_screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES test_runs(id),
    test_result_id INTEGER REFERENCES test_results(id),
    file_path TEXT NOT NULL,
    step_name TEXT,
    taken_at TEXT NOT NULL
  );
`);

function createRun() {
  const now = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO test_runs (status, started_at) VALUES (?, ?)');
  const result = stmt.run('running', now);
  return result.lastInsertRowid;
}

function finishRun(runId, status, stats) {
  const endedAt = new Date().toISOString();
  const startedAt = db.prepare('SELECT started_at FROM test_runs WHERE id = ?').get(runId);
  const durationMs = startedAt ? Date.now() - new Date(startedAt.started_at).getTime() : 0;

  db.prepare(`
    UPDATE test_runs
    SET status = ?, ended_at = ?, duration_ms = ?, total = ?, passed = ?, failed = ?
    WHERE id = ?
  `).run(status, endedAt, durationMs, stats.total, stats.passed, stats.failed, runId);
}

function insertResult(runId, result) {
  const stmt = db.prepare(`
    INSERT INTO test_results (run_id, file_path, test_name, status, duration_ms, error_message, error_stack, screenshot_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    runId,
    result.file_path,
    result.test_name,
    result.status,
    result.duration_ms || 0,
    result.error_message || null,
    result.error_stack || null,
    result.screenshot_path || null
  );
  return info.lastInsertRowid;
}

function insertLog(runId, stream, text) {
  db.prepare(`
    INSERT INTO test_logs (run_id, stream, text, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(runId, stream, text, new Date().toISOString());
}

function insertScreenshot(runId, testResultId, filePath, stepName) {
  db.prepare(`
    INSERT INTO test_screenshots (run_id, test_result_id, file_path, step_name, taken_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(runId, testResultId || null, filePath, stepName || null, new Date().toISOString());
}

// 批量插入截图（从 results.json 的附件解析）
function insertScreenshotsFromAttachments(runId, attachments) {
  const stmt = db.prepare(`
    INSERT INTO test_screenshots (run_id, file_path, step_name, taken_at)
    VALUES (?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const att of attachments || []) {
    const p = att.path || '';
    if (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg')) {
      stmt.run(runId, p, att.name || null, now);
    }
  }
}

// ================================================================
// 查询
// ================================================================

function getRuns(limit = 20) {
  return db.prepare(`SELECT * FROM test_runs ORDER BY id DESC LIMIT ?`).all(limit);
}

function getRunById(runId) {
  return db.prepare('SELECT * FROM test_runs WHERE id = ?').get(runId);
}

function getRunResults(runId) {
  return db.prepare('SELECT * FROM test_results WHERE run_id = ?').all(runId);
}

function getRunLogs(runId) {
  return db.prepare('SELECT * FROM test_logs WHERE run_id = ? ORDER BY id ASC').all(runId);
}

function getRunScreenshots(runId) {
  return db.prepare('SELECT * FROM test_screenshots WHERE run_id = ? ORDER BY id ASC').all(runId);
}

function getRecentRuns(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return db.prepare(`
    SELECT * FROM test_runs
    WHERE started_at >= ? AND status != 'running'
    ORDER BY started_at ASC
  `).all(since);
}

function getOverallStats() {
  const totalRuns = db.prepare("SELECT COUNT(*) as count FROM test_runs WHERE status != 'running'").get();
  const totalTests = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM test_runs WHERE status != 'running'").get();
  const totalPassed = db.prepare("SELECT COALESCE(SUM(passed), 0) as total FROM test_runs WHERE status != 'running'").get();
  const totalFailed = db.prepare("SELECT COALESCE(SUM(failed), 0) as total FROM test_runs WHERE status != 'running'").get();

  return {
    totalRuns: totalRuns.count,
    totalTests: totalTests.total,
    totalPassed: totalPassed.total,
    totalFailed: totalFailed.total,
  };
}

// 清理旧测试结果并重建库（用于表结构调整后重置）
function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS test_screenshots;
    DROP TABLE IF EXISTS test_logs;
    DROP TABLE IF EXISTS test_results;
    DROP TABLE IF EXISTS test_runs;
  `);
  // 重新创建
  db.exec(`
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
    CREATE TABLE IF NOT EXISTS test_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      test_result_id INTEGER REFERENCES test_results(id),
      stream TEXT NOT NULL DEFAULT 'stdout',
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id),
      test_result_id INTEGER REFERENCES test_results(id),
      file_path TEXT NOT NULL,
      step_name TEXT,
      taken_at TEXT NOT NULL
    );
  `);
}

// ================================================================
// 删除运行记录（含关联数据 + 图片文件）
// ================================================================

function deleteRun(runId) {
  // 1. 收集关联的截图文件路径
  const screenshots = db.prepare('SELECT file_path FROM test_screenshots WHERE run_id = ?').all(runId);
  const results = db.prepare('SELECT screenshot_path FROM test_results WHERE run_id = ? AND screenshot_path IS NOT NULL').all(runId);

  const filesToDelete = [];
  for (const s of screenshots) {
    if (s.file_path) filesToDelete.push(s.file_path);
  }
  for (const r of results) {
    if (r.screenshot_path && !filesToDelete.includes(r.screenshot_path)) {
      filesToDelete.push(r.screenshot_path);
    }
  }

  // 2. 删除数据库记录（外键顺序：先删子表，再删主表）
  const del = db.transaction(() => {
    db.prepare('DELETE FROM test_screenshots WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM test_logs WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM test_results WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM test_runs WHERE id = ?').run(runId);
  });
  del();

  // 3. 删除磁盘上的截图文件
  for (const fp of filesToDelete) {
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (_) { /* 忽略删除失败 */ }
  }

  // 4. 删除 tests/report/screenshots/ 下的所有截图（与运行周期关联，全部清理）
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

  // 5. 清理 artifacts 中对应 run 的空目录
  const artifactsDir = path.join(__dirname, '..', 'tests', 'report', 'artifacts');
  if (fs.existsSync(artifactsDir)) {
    try {
      const dirs = fs.readdirSync(artifactsDir);
      for (const dir of dirs) {
        const dirPath = path.join(artifactsDir, dir);
        if (fs.statSync(dirPath).isDirectory()) {
          const subFiles = fs.readdirSync(dirPath);
          // 只保留 attachments 的子目录才递归
          for (const sub of subFiles) {
            const subPath = path.join(dirPath, sub);
            if (fs.statSync(subPath).isDirectory() && sub === 'attachments') {
              const attFiles = fs.readdirSync(subPath);
              for (const attFile of attFiles) {
                const attFilePath = path.join(subPath, attFile);
                // 删除不在 filesToDelete 中的残留截图文件
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

  return { deletedFiles: filesToDelete.length };
}

module.exports = {
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
  resetDatabase,
};
