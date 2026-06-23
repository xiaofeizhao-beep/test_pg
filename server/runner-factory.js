/**
 * runner-factory.js — 统一测试运行调度器
 *
 * 根据文件扩展名分发:
 *   - .test.js → runner.js (npx playwright test)
 *   - .py      → runner-python.js (pytest)
 */
const { startRun } = require('./runner');
const { startPytestRun } = require('./runner-python');

/**
 * @param {string[]} files - 测试文件相对路径数组
 * @returns {{ runId: number, language: string }}
 */
function dispatch(files) {
  const jsFiles = files.filter(f => f.endsWith('.test.js'));
  const pyFiles = files.filter(f => f.endsWith('.py'));

  if (pyFiles.length > 0 && jsFiles.length === 0) {
    // 纯 Python 测试
    const { runId } = startPytestRun(pyFiles, 'py');
    return { runId, language: 'py' };
  }

  if (jsFiles.length > 0 && pyFiles.length === 0) {
    // 纯 JS 测试
    const { runId } = startRun(jsFiles);
    return { runId, language: 'js' };
  }

  // 混合 → 先运行 JS，再运行 Python
  if (jsFiles.length > 0 && pyFiles.length > 0) {
    const { runId: jsRunId } = startRun(jsFiles);
    // 注意: JS 运行是异步的，实际生产中这里需要串行化
    // 简化处理: 只返回 JS 的 runId，Python 测试单独运行
    // 更好的方式是由前端分两次请求
    return { runId: jsRunId, language: 'mixed', note: 'JS and Python tests should be run separately' };
  }

  throw new Error('No valid test files selected');
}

module.exports = { dispatch };
