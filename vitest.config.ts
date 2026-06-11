import { defineConfig } from 'vitest/config';

// Unit/integration tests only. test/e2e/ holds Playwright specs (run via `npm run test:e2e`),
// which vitest's default glob would otherwise try - and fail - to execute.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**', 'node_modules/**'],
  },
});
