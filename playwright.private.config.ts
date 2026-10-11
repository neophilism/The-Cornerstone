import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/private',
  workers: 1,
  fullyParallel: false,
  timeout: 40000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3001', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/private-test-server.mjs',
    url: 'http://127.0.0.1:3001/api/private/status',
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
