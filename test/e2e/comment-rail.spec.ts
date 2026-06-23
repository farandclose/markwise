import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createPreviewServer } from '../../dist/preview/server.js';

// Browser smoke tests for the notes-rail card interactions added after the impeccable / interface-craft
// review: hover-peek (S2), scroll-the-anchor-into-view + focus pulse (S3), click-to-toggle-closed (S4),
// richer closed card (S5), and the card-as-button keyboard path (S6). Drives the COMPILED server from
// dist/, so `npm run build` must run first (`npm run test:e2e` does).

// One committed comment anchored near the END of a long document, so its highlighted span starts
// off-screen - the case S3 exists to fix (clicking the card must bring the prose into view).
const FILLER = Array.from({ length: 60 }, (_, i) => `Filler paragraph ${i} lorem ipsum dolor sit amet.`).join('\n\n');
const TALL = [
  '# Demo',
  '',
  FILLER,
  '',
  'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
  '',
  '<!-- mw:log v=1',
  '{"id":"s1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"thread":[{"by":"reviewer","at":"2026-06-10T00:00:00Z","body":"Push to Q4?"}]}',
  '-->',
  '',
].join('\n');

// A short document whose note already has a two-message thread, for the thread-count chip (S5).
const THREADED = [
  '# Demo',
  '',
  'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
  '',
  '<!-- mw:log v=1',
  '{"id":"s1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"thread":[{"by":"reviewer","at":"2026-06-10T00:00:00Z","body":"Push to Q4?"},{"by":"agent","at":"2026-06-10T00:01:00Z","body":"Done, moved to Q4."}]}',
  '-->',
  '',
].join('\n');

let server: Server;
let dir: string;

async function serve(doc: string): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'mw-rail-'));
  const file = join(dir, 'doc.md');
  writeFileSync(file, doc, 'utf8');
  server = createPreviewServer(file);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/`;
}

test.afterEach(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('clicking a card brings its off-screen anchor into view (S3)', async ({ page }) => {
  await page.goto(await serve(TALL));
  await page.locator('.mw-counter').click(); // reveal the rail
  const span = page.locator('.mw-doc [data-mw-id="s1"]');
  await expect(span).not.toBeInViewport(); // the anchor starts far down the document
  await page.locator('.mw-card').click();
  await expect(span).toBeInViewport(); // the forward bond scrolled it into the column
  await expect(span).toHaveClass(/active/);
});

test('clicking an open card again closes it (S4)', async ({ page }) => {
  await page.goto(await serve(THREADED));
  await page.locator('.mw-counter').click();
  const card = page.locator('.mw-card');
  await card.locator('.mw-card-type').click(); // open
  await expect(card).toHaveClass(/active/);
  await card.locator('.mw-card-type').click(); // click the header again -> close
  await expect(card).not.toHaveClass(/active/);
});

test('the card is a keyboard-operable button that toggles on Enter (S6)', async ({ page }) => {
  await page.goto(await serve(THREADED));
  await page.locator('.mw-counter').click();
  const card = page.locator('.mw-card');
  await expect(card).toHaveAttribute('role', 'button');
  await expect(card).toHaveAttribute('tabindex', '0');
  await expect(card).toHaveAttribute('aria-expanded', 'false');
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveClass(/active/);
  await expect(card).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(card).not.toHaveClass(/active/);
  await expect(card).toHaveAttribute('aria-expanded', 'false');
});

test('hovering a card peeks its anchored prose (S2)', async ({ page }) => {
  await page.goto(await serve(THREADED));
  await page.locator('.mw-counter').click();
  const span = page.locator('.mw-doc [data-mw-id="s1"]');
  await page.locator('.mw-card').hover();
  await expect(span).toHaveClass(/mw-peek/);
  await page.locator('.mw-wordmark').hover(); // move the cursor away
  await expect(span).not.toHaveClass(/mw-peek/);
});

test('a card with a conversation shows a thread-count chip (S5)', async ({ page }) => {
  await page.goto(await serve(THREADED));
  await page.locator('.mw-counter').click();
  await expect(page.locator('.mw-card .mw-card-count')).toHaveText('2');
});

test('a lone opening note shows no thread-count chip (S5)', async ({ page }) => {
  await page.goto(await serve(TALL)); // single-message thread
  await page.locator('.mw-counter').click();
  await expect(page.locator('.mw-card')).toHaveCount(1);
  await expect(page.locator('.mw-card .mw-card-count')).toHaveCount(0);
});
