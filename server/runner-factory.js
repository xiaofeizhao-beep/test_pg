/**
 * runner-factory.js — 统一测试运行调度器
 *
 * 仅支持 pytest (.py) 测试文件
 */
const { startPytestRun } = require('./runner-python');

/**
 * @param {string[]} files - 测试文件相对路径数组
 * @returns {{ runId: number, language: string }}
 */
function dispatch(files) {
  const pyFiles = files.filter(f => f.endsWith('.py'));

  if (pyFiles.length > 0) {
    const { runId } = startPytestRun(pyFiles, 'py');
    return { runId, language: 'py' };
  }

  throw new Error('No valid test files selected — only .py files are supported');
}

module.exports = { dispatch };
