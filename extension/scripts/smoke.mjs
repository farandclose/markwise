// Clean-room contents check for the .vsix, mirroring the engine's npm install-smoke discipline:
// confirm the package ships exactly the built output it needs and none of the source, tests, or
// build config. Run after a build (`npm run smoke` builds first). Lists what vsce would package via
// `vsce ls`, then asserts the required files are present and the forbidden ones are absent.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const out = execFileSync('npx', ['vsce', 'ls', '--no-dependencies'], { encoding: 'utf8', cwd });
const files = out.split('\n').map((s) => s.trim()).filter(Boolean);

const required = [
  'package.json',
  'dist/extension.js',
  'dist/assets/app.js',
  'dist/assets/app.css',
  'dist/assets/bridge.js',
  'dist/assets/AGENT_PROMPT.md',
];
const forbidden = [/^src\//, /^test\//, /node_modules\//, /\.map$/, /\.ts$/, /esbuild/, /tsconfig/, /vitest/, /\.vscode-test/];

const problems = [];
for (const r of required) if (!files.includes(r)) problems.push(`missing required file: ${r}`);
if (!files.some((f) => /^readme\.md$/i.test(f))) problems.push('missing README');
if (!files.some((f) => /^license/i.test(f))) problems.push('missing LICENSE');
for (const f of files) {
  for (const pat of forbidden) if (pat.test(f)) problems.push(`should not ship: ${f}`);
}

if (problems.length) {
  console.error('vsix smoke FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`vsix smoke ok: ${files.length} files; all required present, no source/test/config shipped`);
