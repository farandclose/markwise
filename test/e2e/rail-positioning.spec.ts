import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createPreviewServer } from '../../dist/preview/server.js';

// Browser tests for the anchor-aligned notes rail (Google-Docs margin model): each card floats at its
// anchored text's vertical position, so a comment and its text are co-visible. Drives the COMPILED
// server from dist/, so `npm run build` must run first (`npm run test:e2e` does).

const FILLER = Array.from({ length: 60 }, (_, i) => `Filler paragraph ${i} lorem ipsum dolor sit amet.`).join('\n\n');

// Two comments far apart: one near the top, one near the bottom of a long document.
const TWO = [
  '# Demo',
  '',
  'Top note on <!-- mw:s1 -->alpha<!-- /mw:s1 --> here.',
  '',
  FILLER,
  '',
  'Bottom note on <!-- mw:s2 -->omega<!-- /mw:s2 --> here.',
  '',
  'Trailing one.',
  '',
  'Trailing two.',
  '',
  '<!-- mw:log v=1',
  '{"id":"s1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"on ","after":" here"},"thread":[{"by":"reviewer","at":"2026-06-10T00:00:00Z","body":"Top comment."}]}',
  '{"id":"s2","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"on ","after":" here"},"thread":[{"by":"reviewer","at":"2026-06-10T00:01:00Z","body":"This comment is at the bottom of the page."}]}',
  '-->',
  '',
].join('\n');

// Two comments anchored on the SAME line, so their cards would overlap and must push apart.
const SAMELINE = [
  '# Demo',
  '',
  'Alpha <!-- mw:s1 -->one<!-- /mw:s1 --> and omega <!-- mw:s2 -->two<!-- /mw:s2 --> together.',
  '',
  '<!-- mw:log v=1',
  '{"id":"s1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"Alpha ","after":" and"},"thread":[{"by":"reviewer","at":"2026-06-10T00:00:00Z","body":"First."}]}',
  '{"id":"s2","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"omega ","after":" toge"},"thread":[{"by":"reviewer","at":"2026-06-10T00:01:00Z","body":"Second."}]}',
  '-->',
  '',
].join('\n');

let server: Server;
let dir: string;

async function serve(doc: string): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'mw-pos-'));
  const file = join(dir, 'doc.md');
  writeFileSync(file, doc, 'utf8');
  server = createPreviewServer(file);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/`;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 900 });
});

test.afterEach(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('each card floats level with its anchored text, not stacked at the top', async ({ page }) => {
  await page.goto(await serve(TWO));
  await page.locator('.mw-counter').click(); // reveal the rail
  const c1 = await page.locator('.mw-card[data-mw-id="s1"]').boundingBox();
  const a1 = await page.locator('.mw-doc [data-mw-id="s1"]').boundingBox();
  const c2 = await page.locator('.mw-card[data-mw-id="s2"]').boundingBox();
  const a2 = await page.locator('.mw-doc [data-mw-id="s2"]').boundingBox();
  // Each card's top is aligned to its anchor's top.
  expect(Math.abs(c1!.y - a1!.y)).toBeLessThan(8);
  expect(Math.abs(c2!.y - a2!.y)).toBeLessThan(8);
  // The two cards are far apart (the bottom one is NOT stacked under the top one).
  expect(c2!.y - c1!.y).toBeGreaterThan(400);
});

test('the bottom comment and its text are co-visible when you scroll to it', async ({ page }) => {
  await page.goto(await serve(TWO));
  await page.locator('.mw-counter').click();
  const anchor = page.locator('.mw-doc [data-mw-id="s2"]');
  const card = page.locator('.mw-card[data-mw-id="s2"]');
  await expect(anchor).not.toBeInViewport(); // starts off-screen at the top
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // The whole point: at the bottom of the doc, the bottom note's text AND its card share the frame.
  await expect(anchor).toBeInViewport();
  await expect(card).toBeInViewport();
});

test('clicking the bottom card scrolls to its text and keeps both co-visible', async ({ page }) => {
  await page.goto(await serve(TWO));
  await page.locator('.mw-counter').click();
  await page.locator('.mw-card[data-mw-id="s2"]').click();
  await expect(page.locator('.mw-doc [data-mw-id="s2"]')).toBeInViewport();
  await expect(page.locator('.mw-card[data-mw-id="s2"]')).toBeInViewport();
  await expect(page.locator('.mw-card[data-mw-id="s2"]')).toHaveClass(/active/);
});

test('overlapping cards push down instead of stacking on top of each other', async ({ page }) => {
  await page.goto(await serve(SAMELINE));
  await page.locator('.mw-counter').click();
  const c1 = await page.locator('.mw-card[data-mw-id="s1"]').boundingBox();
  const c2 = await page.locator('.mw-card[data-mw-id="s2"]').boundingBox();
  // Same-line anchors: the second card cannot sit on top of the first - it is pushed below it.
  expect(c2!.y).toBeGreaterThanOrEqual(c1!.y + c1!.height - 1);
});

test('opening the rail does not move the reading column', async ({ page }) => {
  await page.goto(await serve(TWO));
  const anchor = page.locator('.mw-doc [data-mw-id="s1"]');
  const before = await anchor.boundingBox();
  await page.locator('.mw-counter').click(); // reveal the rail
  const after = await anchor.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
});
