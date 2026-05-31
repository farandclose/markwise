import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lintText } from '../src/lint.js';

// A frozen, known-good document that must always lint clean. This is the integration guard against
// rule false positives. It lives under test/fixtures (immutable) - NOT sample.md, which is the
// editable demo/scratch file you can freely break while exercising the linter.
test('the clean reference document lints with no findings', () => {
  const path = fileURLToPath(new URL('./fixtures/clean_reference.md', import.meta.url));
  const findings = lintText(readFileSync(path, 'utf8'));
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
});
