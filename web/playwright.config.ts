import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['iPhone 14'],
    // devices['iPhone 14'] defaults to webkit (real iPhones run Safari), but
    // only chromium is installed in this project's CI/dev setup — force it
    // so the mobile viewport/touch emulation is kept without requiring a
    // separate webkit install.
    defaultBrowserType: 'chromium',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
