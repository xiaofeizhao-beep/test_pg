/**
 * global-setup.js — Playwright 全局前置
 * 每次运行前清除旧日志和产物
 */
const fs = require('fs');
const path = require('path');

async function cleanReportDir() {
  const reportDir = path.resolve(__dirname, 'tests', 'report');
  const dirsToClean = ['screenshots', 'artifacts', 'html'];
  const filesToRemove = ['results.json'];

  for (const dirName of dirsToClean) {
    const dirPath = path.join(reportDir, dirName);
    try {
      if (fs.existsSync(dirPath)) {
        for (const entry of fs.readdirSync(dirPath)) {
          try {
            fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
          } catch (_) { /* 跳过删除失败的文件 */ }
        }
      }
    } catch (_) { /* 跳过无法读取的目录 */ }
  }

  for (const fileName of filesToRemove) {
    const filePath = path.join(reportDir, fileName);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) { /* 跳过无法删除的文件 */ }
  }

  console.log('🧹 旧日志和产物已清除');
}

module.exports = cleanReportDir;
