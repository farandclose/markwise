import { defineConfig } from '@vscode/test-cli';

// Integration tests run inside a real (downloaded) VS Code instance with this extension loaded.
// They drive the extension through the vscode API only. Compile them first with tsconfig.test.json
// (`npm run pretest:integration`), then `npm run test:integration`.
export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  version: 'stable',
  mocha: { ui: 'tdd', timeout: 20000 },
});
