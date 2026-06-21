// Copies the webview's static assets into dist/assets/ so the bundled extension can serve them via
// asWebviewUri. Two sources:
//   - the engine's previewer client (app.js / app.css) - reused verbatim from src/preview/assets so
//     the review experience matches the browser previewer (R2). index.html is NOT copied; the host
//     templates it in panel.ts so the root-absolute asset refs and inline theme-bootstrap script can
//     be replaced for the CSP'd webview (U3).
//   - the extension's own webview assets (media/*, e.g. the postMessage transport shim), if present.
import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dest = new URL('../dist/assets/', import.meta.url);
await mkdir(dest, { recursive: true });

const engineAssets = new URL('../../src/preview/assets/', import.meta.url);
for (const name of ['app.js', 'app.css']) {
  await cp(new URL(name, engineAssets), new URL(name, dest));
}

// The agent-instruction template the in-process handoff prepends to its briefing (U6). Copied from
// the engine's canonical AGENT_PROMPT.md so the editor handoff emits the same protocol as the CLI.
await cp(new URL('../../AGENT_PROMPT.md', import.meta.url), new URL('AGENT_PROMPT.md', dest));

// Extension-owned webview assets live in media/ (added in U3). Copy them all if the dir exists.
const media = new URL('../media/', import.meta.url);
try {
  for (const name of await readdir(media)) {
    await cp(new URL(name, media), new URL(name, dest));
  }
} catch {
  // no media/ yet (U2 scaffold) - nothing to copy
}

console.log(`copied webview assets -> ${fileURLToPath(dest)}`);
