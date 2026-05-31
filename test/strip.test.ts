import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripText } from '../src/strip.js';

test('strips the clean reference document to plain prose', () => {
  const path = fileURLToPath(new URL('./fixtures/clean_reference.md', import.meta.url));
  const out = stripText(readFileSync(path, 'utf8'));

  // The prose survives, with wrapped text kept and markers gone.
  expect(out).toContain('The product ships by Q3 of next year.');
  expect(out).toContain('The market is large and growing.');

  // No Markwise machinery of any kind remains.
  expect(out).not.toContain('mw:');
  expect(out).not.toContain('<!--');
  expect(out).not.toContain('mw:log');
});

test('removes both log and archive blocks', () => {
  const src = `Title.<!-- mw:c1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"Title."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}
-->

<!-- mw:archive v=1
{"id":"a1","type":"comment","state":"resolved","at":"t","summary":"done"}
-->`;
  const out = stripText(src);
  expect(out.trim()).toBe('Title.');
});

test('keeps the wrapped text of a span and drops a point marker cleanly', () => {
  const out = stripText('The market is <!-- mw:s3 -->large<!-- /mw:s3 --> today.<!-- mw:p1 -->');
  expect(out.trim()).toBe('The market is large today.');
});

test('a document with no Markwise data is returned essentially unchanged', () => {
  const out = stripText('# Heading\n\nJust prose.\n');
  expect(out).toBe('# Heading\n\nJust prose.\n');
});
