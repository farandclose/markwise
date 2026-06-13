import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Markwise's marker parser and offset/hash anchoring assume LF line endings: a CRLF file lints as
// broken (orphaned markers, leaked records). `.gitattributes` forces LF on checkout everywhere,
// including Windows. This guard catches a regression of that invariant with a clear message,
// rather than letting it resurface as cryptic L142/L106 lint errors on Windows CI.
const CANONICAL_LF_FILES = [
  'sample.md',
  'README.md',
  'AGENT_PROMPT.md',
  'AUTHOR_PROMPT.md',
  'SETUP_PROMPT.md',
];

test.each(CANONICAL_LF_FILES)('%s uses LF line endings (no CRLF)', (rel) => {
  const text = readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8');
  expect(text.includes('\r'), `${rel} contains a CR (\\r); it must use LF-only line endings`).toBe(false);
});
