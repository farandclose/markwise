import { test, expect } from 'vitest';
import { lintText } from '../src/lint.js';
import { fixText } from '../src/fix.js';

// --fix mends mechanical anchor fields only (D38): a stale hash and drifted before/after context.
// After a fix, the previously-warned document should lint clean - and nothing semantic moves.

const staleHash = `The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> of next year.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"deadbeef","before":"ships by ","after":" of next"},"text":"Q4","thread":[{"by":"reviewer","at":"t","body":"Q4"}]}
-->`;

const badContext = `The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> of next year.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"9fc58f1a","before":"WRONGXX  ","after":" of next"},"text":"Q4","thread":[{"by":"reviewer","at":"t","body":"Q4"}]}
-->`;

test('--fix recomputes a stale hash and the doc lints clean', () => {
  expect(lintText(staleHash).map((f) => f.rule)).toContain('L201');
  const { output, changes } = fixText(staleHash);
  expect(changes.some((c) => c.includes('hash'))).toBe(true);
  expect(lintText(output)).toEqual([]);
});

test('--fix refreshes before/after context and the doc lints clean', () => {
  expect(lintText(badContext).map((f) => f.rule)).toContain('L202');
  const { output } = fixText(badContext);
  expect(lintText(output)).toEqual([]);
});

test('--fix never touches prose, disp, state, threads, or text', () => {
  const { output } = fixText(staleHash);
  expect(output).toContain('The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> of next year.');
  expect(output).toContain('"disp":"none"');
  expect(output).toContain('"state":"open"');
  expect(output).toContain('"text":"Q4"');
  expect(output).toContain('"body":"Q4"');
});

test('--fix is a no-op on an already-clean document', () => {
  const clean = fixText(staleHash).output;
  const second = fixText(clean);
  expect(second.changes).toEqual([]);
  expect(second.output).toBe(clean);
});
