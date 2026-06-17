import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright Test 全局配置
 * 
 * 目录结构:
 *   tests/
 *   ├─ cases/       # AI 生成的自动化用例
 *   ├─ fixtures/    # 公共前置 fixture
 *   └─ report/      # 测试报告产物
 */
export default defineConfig({
  // 测试文件目录
  testDir: './tests/cases',

  // 全局超时 (每个用例)
  timeout: 60 * 1000,

  // expect 断言超时
  expect: {
    timeout: 15 * 1000,
  },

  // 失败重试
  retries: process.env.CI ? 1 : 0,

  // 并发数
  workers: process.env.CI ? 2 : 1,

  // 报告输出
  reporter: [
    ['html', { outputFolder: 'tests/report/html', open: 'never' }],
    ['json', { outputFile: 'tests/report/results.json' }],
    ['list'],
  ],

  // 全局配置
  use: {
    // 基础 URL (从环境变量读取，默认 dev 环境)
    baseURL: process.env.PORTAL_URL || 'https://portal-dev.unitpulse.ai',

    // 默认有头模式 (CI 环境自动无头)
    headless: process.env.CI ? true : (process.env.HEADLESS === 'true'),

    // 截图: 仅失败时自动截图
    screenshot: 'only-on-failure',

    // 录像: 失败时保留
    video: 'retain-on-failure',

    // Trace: 失败时保留
    trace: 'retain-on-failure',

    // 操作超时
    actionTimeout: 15 * 1000,
  },

  // 浏览器项目配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 产物目录
  outputDir: 'tests/report/artifacts',
});
