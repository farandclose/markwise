// Bundles the extension host entry into a single CommonJS file VS Code can load. `vscode` stays
// external (the runtime provides it); the Markwise engine and markdown-it are bundled in, so the
// shipped .vsix needs no separately installed `markwise` CLI (KTD7, R8). The engine is imported as
// the bare specifier `markwise` and aliased here to the built library entry (../dist/index.js), the
// same alias vitest and tsconfig use - so source, tests, and bundle all resolve the engine identically.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const enginePath = fileURLToPath(new URL('../dist/index.js', import.meta.url));

const ctx = await esbuild.context({
  entryPoints: [fileURLToPath(new URL('./src/extension.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/extension.js', import.meta.url)),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  alias: { markwise: enginePath },
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild] watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
