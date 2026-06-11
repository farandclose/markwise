// Builds the README demo GIF against the real previewer.
//
//   node scripts/demo-gif.mjs prep     - create docs/demo-src/launch-plan.md and leave the
//                                        reviewer comment through the browser UI
//   (an agent then acts on the note: `markwise prompt docs/demo-src/launch-plan.md`)
//   node scripts/demo-gif.mjs record   - replay the loop on a copy and record video
//
// Then: ffmpeg converts the printed .webm into docs/demo.gif (see scripts/demo-gif.md).

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreviewServer } from '../dist/preview/server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'docs', 'demo-src');
const srcFile = join(srcDir, 'launch-plan.md');

const DOC = [
  '# Launch plan - partner beta',
  '',
  '## Rollout',
  '',
  'We will launch the partner beta in Q4 2026, with mobile following in the new year. Pricing stays flat through the beta period.',
  '',
  '## Risks',
  '',
  'Support coverage is thin until the new hires land in October.',
  '',
].join('\n');

const CURSOR = () => {
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText =
      'position:fixed;left:-40px;top:-40px;width:16px;height:16px;border-radius:50%;' +
      'background:rgba(178,122,22,.45);border:1.5px solid rgba(178,122,22,.95);' +
      'pointer-events:none;z-index:99999;transform:translate(-50%,-50%);transition:transform .08s';
    document.body.appendChild(c);
    window.addEventListener('mousemove', (e) => {
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
    }, true);
    window.addEventListener('mousedown', () => { c.style.transform = 'translate(-50%,-50%) scale(.65)'; }, true);
    window.addEventListener('mouseup', () => { c.style.transform = 'translate(-50%,-50%)'; }, true);
  });
};

// Center of the first occurrence of `word` in the rendered document. getByText() resolves to
// the whole paragraph, so clicks land on its center; this finds the word itself.
async function wordCenter(page, word) {
  const pt = await page.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector('.mw-doc'), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(w);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + w.length);
        const b = r.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    return null;
  }, word);
  if (!pt) throw new Error(`word not found in document: ${word}`);
  return pt;
}

async function dblclickWord(page, word, settle = 500) {
  const { x, y } = await wordCenter(page, word);
  await page.mouse.move(x, y, { steps: 12 });
  await page.waitForTimeout(settle);
  await page.mouse.dblclick(x, y);
}

async function serve(file) {
  const server = createPreviewServer(file);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r()));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function openPage(url, { record } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ...(record ? { recordVideo: { dir: record, size: { width: 1280, height: 720 } } } : {}),
  });
  const page = await context.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mw-theme', 'sepia'); } catch (e) {} });
  await page.addInitScript(CURSOR);
  await page.goto(url);
  return { browser, context, page };
}

const mode = process.argv[2];

if (mode === 'prep') {
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(srcFile, DOC, 'utf8');
  const { server, url } = await serve(srcFile);
  const { browser, page } = await openPage(url);
  await dblclickWord(page, 'Q4', 0);
  await page.locator('.mw-pill').click();
  await page
    .locator('.mw-draft textarea')
    .fill('We agreed H2, not Q4 - the partner beta cannot slip past summer.');
  await page.locator('.mw-draft-add').click();
  await page.waitForTimeout(400);
  await browser.close();
  server.close();
  console.log('prepared:', srcFile);
  console.log(readFileSync(srcFile, 'utf8'));
} else if (mode === 'record') {
  const dir = mkdtempSync(join(tmpdir(), 'mw-demo-'));
  const file = join(dir, 'launch-plan.md');
  copyFileSync(srcFile, file);
  const { server, url } = await serve(file);
  const { browser, context, page } = await openPage(url, { record: dir });

  // 1. Open on the document; reveal the notes rail with the agent-answered thread.
  await page.waitForTimeout(1400);
  await page.locator('.mw-counter').hover();
  await page.waitForTimeout(400);
  await page.locator('.mw-counter').click();
  await page.waitForTimeout(2600);

  // 2. Select a date and type the correction: an inline suggested replacement.
  await dblclickWord(page, 'October');
  await page.waitForTimeout(700);
  await page.keyboard.type('January', { delay: 90 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  // 3. Select a word and leave a comment through the pill.
  await dblclickWord(page, 'Pricing');
  await page.waitForTimeout(600);
  await page.locator('.mw-pill').click();
  await page.waitForTimeout(400);
  await page.locator('.mw-draft textarea').pressSequentially('Does this hold for existing partners too?', { delay: 35 });
  await page.waitForTimeout(400);
  await page.locator('.mw-draft-add').click();
  await page.waitForTimeout(1800);

  // 4. Read the agent's reply on the H2 thread and resolve it.
  const answered = page.locator('.mw-card', { hasText: 'We agreed H2' });
  await answered.hover();
  await page.waitForTimeout(500);
  await answered.click();
  await page.waitForTimeout(1600);
  await answered.locator('.mw-resolve-btn').click();
  await page.waitForTimeout(2200);

  await context.close(); // flush the video
  const video = await page.video().path().catch(() => null);
  await browser.close();
  server.close();
  console.log('video:', video || `look in ${dir}`);
} else {
  console.error('usage: node scripts/demo-gif.mjs prep|record');
  process.exit(2);
}
