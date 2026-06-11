import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createPreviewServer } from '../../dist/preview/server.js';

// Browser smoke tests for the previewer's core gestures - the DOM-selection layer that the unit
// suite (which stops at the HTTP boundary) cannot reach. Imports the COMPILED server from dist/,
// so `npm run build` must run first (`npm run test:e2e` does).
//
// Single-word paragraphs make double-click deterministic: the word under the cursor's center is
// always the word we mean.

const PROSE = [
  '# Demo',
  '',
  'Alpha bravo charlie.',
  '',
  'Replaceme',
  '',
  'Deleteme',
  '',
  'Closing prose.',
  '',
].join('\n');

// A document with one committed note, for the resolve/discard flows (same shape the unit suite uses).
const NOTED = [
  '# Demo',
  '',
  'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
  '',
  '<!-- mw:log v=1',
  '{"id":"s1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"thread":[{"by":"reviewer","at":"2026-06-10T00:00:00Z","body":"Push to Q4?"}]}',
  '-->',
  '',
].join('\n');

let server: Server;
let dir: string;
let file: string;

async function serve(doc: string): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'mw-e2e-'));
  file = join(dir, 'doc.md');
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

test('select a word, click the pill, add a comment', async ({ page }) => {
  await page.goto(await serve(PROSE));
  await page.locator('.mw-doc').getByText('Replaceme').dblclick();
  await page.locator('.mw-pill').click();
  await page.locator('.mw-draft textarea').fill('Needs work');
  await page.locator('.mw-draft-add').click();
  await expect(page.locator('.mw-card')).toHaveCount(1);
  await expect(page.locator('.mw-card .mw-msg-body')).toHaveText('Needs work');
  const onDisk = readFileSync(file, 'utf8');
  expect(onDisk).toContain('<!-- mw:n1 -->Replaceme<!-- /mw:n1 -->');
  expect(onDisk).toContain('Needs work');
});

test('select a word and type to propose a replacement', async ({ page }) => {
  await page.goto(await serve(PROSE));
  await page.locator('.mw-doc').getByText('Replaceme').dblclick();
  await page.keyboard.type('Better');
  await page.keyboard.press('Enter');
  await expect(page.locator('.mw-card.mw-type-replace')).toHaveCount(1);
  const onDisk = readFileSync(file, 'utf8');
  expect(onDisk).toContain('"type":"replace"');
  expect(onDisk).toContain('"text":"Better"');
  expect(onDisk).toContain('Replaceme'); // the original stays; it is a suggestion
});

test('click a point and type to propose an insertion', async ({ page }) => {
  await page.goto(await serve(PROSE));
  await page.locator('.mw-doc').getByText('Deleteme').click();
  await page.keyboard.type('XX');
  await page.keyboard.press('Enter');
  await expect(page.locator('.mw-card.mw-type-insert')).toHaveCount(1);
  const onDisk = readFileSync(file, 'utf8');
  expect(onDisk).toContain('"type":"insert"');
  expect(onDisk).toContain('"text":"XX"');
});

test('select a word and press Delete to propose a deletion', async ({ page }) => {
  await page.goto(await serve(PROSE));
  await page.locator('.mw-doc').getByText('Deleteme').dblclick();
  await page.keyboard.press('Delete');
  await expect(page.locator('.mw-card.mw-type-delete')).toHaveCount(1);
  const onDisk = readFileSync(file, 'utf8');
  expect(onDisk).toContain('"type":"delete"');
  expect(onDisk).toContain('Deleteme'); // prose kept; the agent applies the deletion later
});

test('resolve archives the note and clears the rail', async ({ page }) => {
  await page.goto(await serve(NOTED));
  await page.locator('.mw-counter').click(); // leave clean reading mode: reveal the notes rail
  await expect(page.locator('.mw-card')).toHaveCount(1);
  await page.locator('.mw-card').click(); // activate: the verbs are hidden until the card is active
  await page.locator('.mw-resolve-btn').click();
  await expect(page.locator('.mw-card')).toHaveCount(0);
  const onDisk = readFileSync(file, 'utf8');
  expect(onDisk).toContain('mw:archive');
  expect(onDisk).not.toContain('mw:s1');
});

test('discard removes the note without archiving and restores the prose', async ({ page }) => {
  await page.goto(await serve(NOTED));
  await page.locator('.mw-counter').click(); // leave clean reading mode: reveal the notes rail
  await page.locator('.mw-card').click(); // activate first, as a reviewer would
  await page.locator('.mw-card-discard').click();
  await page.locator('.mw-discard-remove').click();
  await expect(page.locator('.mw-card')).toHaveCount(0);
  const onDisk = readFileSync(file, 'utf8');
  expect(onDisk).not.toContain('mw:s1');
  expect(onDisk).not.toContain('mw:archive');
  expect(onDisk).toContain('Ships by Q3.');
});

test('a stale tab cannot mis-anchor a note: the write is refused and the view refreshes', async ({ page }) => {
  await page.goto(await serve(PROSE));
  // Hold a selection made against the old render...
  await page.locator('.mw-doc').getByText('Deleteme').dblclick();
  // ...then the file changes underneath the open page (an agent pass, an editor save).
  const edited = '# Changed underneath\n\nTotally different prose now.\n';
  writeFileSync(file, edited, 'utf8');
  // The gesture lands on stale offsets: the server must refuse, the page must recover.
  await page.keyboard.press('Delete');
  await expect(page.locator('.mw-toast')).toContainText('Document changed');
  await expect(page.locator('.mw-doc')).toContainText('Totally different prose');
  expect(readFileSync(file, 'utf8')).toBe(edited); // nothing was written
});
