import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lintText } from '../src/lint.js';

// Unlike the per-rule fixtures (which trip one rule each in isolation), this guards a single
// document carrying SEVERAL realistic mistakes at once - the way an actual agent mangles a file:
// a drifted hash on two notes (L201), a note marked resolved but left in mw:log (L301), and a
// declined note whose loop was never closed (L303). Proves the rules compose correctly and that
// line numbers and the error/warning split survive a busy document.
test('a realistically messy document triggers the full expected spread', () => {
  const path = fileURLToPath(new URL('./fixtures/messy_realistic.md', import.meta.url));
  const findings = lintText(readFileSync(path, 'utf8'));

  // Sorted by line, then rule id (the lint contract).
  expect(findings.map((f) => `${f.line}:${f.rule}`)).toEqual([
    '10:L201',
    '11:L301',
    '12:L201',
    '12:L303',
  ]);

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  expect(errors.map((f) => f.rule)).toEqual(['L301']);
  expect(warnings).toHaveLength(3);
});
