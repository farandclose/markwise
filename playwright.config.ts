import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests for the previewer (test/e2e/). Each spec builds its own server on an
// ephemeral port from the COMPILED output, so run `npm run build` first - or use the
// `npm run test:e2e` script, which builds then tests.
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
