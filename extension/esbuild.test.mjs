// Bundles the @vscode/test-electron integration tests the same way the extension is bundled: CJS,
// `vscode` external (the runtime provides it), the engine aliased and inlined. Bundling - rather than
// plain tsc - lets a test white-box-import a host module (save.ts, watch.ts, handoff.ts) and get the
// engine inlined with it, so the compiled test needs no `markwise` resolution at runtime (the engine's
// exports map is import-only, which a CommonJS require cannot resolve). Mocha's tdd globals
// (suite/test/suiteSetup/...) are provided by the runner, so they stay as free runtime references.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const testDir = new URL('./test/integration/', import.meta.url);
const entryPoints = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => fileURLToPath(new URL(f, testDir)));

const enginePath = fileURLToPath(new URL('../dist/index.js', import.meta.url));

await esbuild.build({
  entryPoints,
  outdir: fileURLToPath(new URL('./out/test/integration/', import.meta.url)),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  alias: { markwise: enginePath },
  sourcemap: true,
  logLevel: 'info',
});
