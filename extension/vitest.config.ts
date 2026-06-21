import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Pure-module unit tests (no vscode API) run here, fast and headless. The engine is resolved through
// the same `markwise` alias the esbuild bundle uses, so unit tests exercise the exact engine surface
// the shipped extension calls.
export default defineConfig({
  resolve: {
    alias: {
      markwise: fileURLToPath(new URL('../dist/index.js', import.meta.url)),
    },
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
  },
});
