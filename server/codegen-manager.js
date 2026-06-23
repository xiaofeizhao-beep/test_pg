/**
 * codegen-manager.js — Playwright Codegen 会话管理
 *
 * 管理 npx playwright codegen 录制会话:
 *   - startSession(url, outputPath) → sessionId
 *   - getStatus(sessionId) → { active, outputFile, startTime }
 *   - getGeneratedCode(sessionId) → 文件内容
 *   - postProcess(sessionId) → 调用 Python 后处理器
 *   - saveToTestDir(sessionId, module) → 保存到 tests/pytest/cases/
 *   - stopSession(sessionId) → 杀死 codegen 进程
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const sessions = new Map();

let nextSessionId = 1;

function startSession(url, outputPath) {
  const sid = `codegen-${nextSessionId++}-${Date.now()}`;
  const outFile = outputPath || path.join(PROJECT_ROOT, 'tests', 'report', `codegen-${sid}.py`);

  // 确保目录存在
  const dir = path.dirname(outFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log(`🎬 启动录制: ${url} → ${outFile}`);

  const child = spawn('npx', [
    'playwright', 'codegen',
    '--target', 'python-pytest',
    '-o', outFile,
    url,
  ], {
    cwd: PROJECT_ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const session = {
    id: sid,
    url,
    outputFile: outFile,
    process: child,
    startTime: new Date().toISOString(),
    active: true,
    logs: [],
  };

  child.stdout.on('data', (chunk) => {
    session.logs.push({ stream: 'stdout', text: chunk.toString(), time: new Date().toISOString() });
  });

  child.stderr.on('data', (chunk) => {
    session.logs.push({ stream: 'stderr', text: chunk.toString(), time: new Date().toISOString() });
  });

  child.on('close', (code) => {
    session.active = false;
    session.exitCode = code;
    session.endedAt = new Date().toISOString();
    console.log(`🎬 录制结束: ${sid} (exit=${code})`);
  });

  child.on('error', (err) => {
    session.active = false;
    session.error = err.message;
  });

  sessions.set(sid, session);
  return { sessionId: sid, outputFile: outFile };
}

function getStatus(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return { error: 'Session not found' };
  return {
    id: s.id,
    url: s.url,
    outputFile: s.outputFile,
    active: s.active,
    startTime: s.startTime,
    endedAt: s.endedAt || null,
    exitCode: s.exitCode,
    error: s.error || null,
  };
}

function getGeneratedCode(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return { error: 'Session not found' };
  try {
    if (!fs.existsSync(s.outputFile)) return { code: '', note: 'File not generated yet' };
    const code = fs.readFileSync(s.outputFile, 'utf-8');
    return { code, filePath: s.outputFile };
  } catch (e) {
    return { error: e.message };
  }
}

function postProcess(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return { error: 'Session not found' };

  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'postprocess_pytest.py');
  if (!fs.existsSync(scriptPath)) {
    return { error: 'postprocess_pytest.py not found', note: 'Scripts directory not yet created' };
  }

  try {
    const { execSync } = require('child_process');
    const result = execSync(`python "${scriptPath}" "${s.outputFile}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { success: true, output: result };
  } catch (e) {
    return { error: e.message, output: e.stdout || '' };
  }
}

function saveToTestDir(sessionId, moduleName) {
  const s = sessions.get(sessionId);
  if (!s) return { error: 'Session not found' };

  try {
    const targetDir = path.join(PROJECT_ROOT, 'tests', 'pytest', 'cases', moduleName || 'generated');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const baseName = path.basename(s.outputFile);
    const targetPath = path.join(targetDir, baseName);

    fs.copyFileSync(s.outputFile, targetPath);
    return { success: true, savedTo: targetPath };
  } catch (e) {
    return { error: e.message };
  }
}

function stopSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return { error: 'Session not found' };
  if (s.process && !s.process.killed) {
    s.process.kill('SIGTERM');
  }
  s.active = false;
  return { success: true };
}

function listSessions() {
  const result = [];
  for (const [, s] of sessions) {
    result.push({
      id: s.id,
      url: s.url,
      active: s.active,
      startTime: s.startTime,
    });
  }
  return result;
}

module.exports = {
  startSession,
  getStatus,
  getGeneratedCode,
  postProcess,
  saveToTestDir,
  stopSession,
  listSessions,
};
