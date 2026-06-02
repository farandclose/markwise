// tsc only emits .js from .ts, so the previewer's static assets (html/css/js) must be copied into
// dist so the compiled server can serve them. Run as part of `pnpm build`.
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src/preview/assets/', import.meta.url));
const dest = fileURLToPath(new URL('../dist/preview/assets/', import.meta.url));

await cp(src, dest, { recursive: true });
console.log(`copied preview assets -> ${dest}`);
