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

test('mw: examples inside a fenced code block survive the strip', () => {
  // A doc that *documents* Markwise: the fence shows a log block and a marker as example text.
  const src = [
    '# How Markwise stores notes',
    '',
    'Real marker: <!-- mw:c1 -->here<!-- /mw:c1 -->.',
    '',
    '```markdown',
    'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
    '',
    '<!-- mw:log v=1',
    '{"id":"s1","type":"comment","state":"open"}',
    '-->',
    '```',
    '',
    '<!-- mw:log v=1',
    '{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"marker: ","after":"."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}',
    '-->',
    '',
  ].join('\n');
  const out = stripText(src);
  // The real marker and the real log block are gone.
  expect(out).toContain('Real marker: here.');
  expect(out).not.toContain('"id":"c1"');
  // The fenced example is byte-intact: marker, opener, record, and close all survive.
  expect(out).toContain('Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.');
  expect(out).toContain('<!-- mw:log v=1\n{"id":"s1","type":"comment","state":"open"}\n-->');
});

test('a fenced example does not swallow following prose (non-greedy regex regression)', () => {
  // The old regex-based strip ate from a fenced `<!-- mw:log` to the next `-->` anywhere in the
  // file, deleting the prose between them.
  const src = [
    '```',
    '<!-- mw:log v=1',
    '```',
    '',
    'Prose that must survive.',
    '',
    '<!-- mw:c9 -->',
    '',
    '<!-- mw:log v=1',
    '{"id":"c9","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"survive."},"thread":[{"by":"reviewer","at":"t","body":"x"}]}',
    '-->',
    '',
  ].join('\n');
  const out = stripText(src);
  expect(out).toContain('Prose that must survive.');
  expect(out).toContain('```\n<!-- mw:log v=1\n```');
  expect(out).not.toContain('mw:c9');
});
