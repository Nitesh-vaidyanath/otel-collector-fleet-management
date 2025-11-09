import path from 'path';
import { defineConfig, devices } from '@playwright/test';

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.join(__dirname, 'playwright-report');
const STORAGE_STATE = path.join(__dirname, 'playwright', '.auth', 'user.json');
const TEST_DIR = path.join(ROOT, 'plugin', 'tests', 'e2e');

export default defineConfig({
  testDir: TEST_DIR,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: path.join(REPORT_DIR, 'results.json') }],
    ['junit', { outputFile: path.join(REPORT_DIR, 'junit.xml') }],
  ],
  use: {
    baseURL: process.env.GRAFANA_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Store authentication state for all tests
    storageState: STORAGE_STATE,
  },

  projects: [
    // Setup project - runs once to authenticate
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // Only test in chromium for faster tests
    // Uncomment below if you want to test all browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    //   dependencies: ['setup'],
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    //   dependencies: ['setup'],
    // },
  ],

  webServer: {
    command: 'docker compose up -d grafana mysql',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
