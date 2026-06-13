import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync as rfs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readDocument, writeDocument } from '../src/eol.js';
import { lintText } from '../src/lint.js';
import { stripText } from '../src/strip.js';

// The CLI reads a user file with readDocument (normalizing to LF) before calling the LF-only core,
// and writes with writeDocument (re-applying the ending). These tests verify that exact pairing -
// the same composition lintCommand/exportCommand perform - without spawning the binary.

const samplePath = fileURLToPath(new URL('../sample.md', import.meta.url));

test('a CRLF copy of sample.md lints clean through the read path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-cli-'));
  try {
    const crlf = rfs(samplePath, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    const file = join(dir, 'sample.md');
    writeFileSync(file, crlf, 'utf8');
    const { source } = readDocument(file);
    expect(lintText(source)).toEqual([]); // clean - the exact bug a raw CRLF read produced
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('export of a CRLF document re-applies CRLF to the clean copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-cli-'));
  try {
    const file = join(dir, 'doc.md');
    const out = join(dir, 'clean.md');
    writeFileSync(file, '# T\r\n\r\nHi <!-- mw:n1 -->there<!-- /mw:n1 -->.\r\n', 'utf8');
    const { source, eol } = readDocument(file);
    writeDocument(out, stripText(source), eol);
    const written = readFileSync(out, 'utf8');
    expect(written.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(written)).toBe(false); // uniform CRLF
    expect(written).not.toContain('mw:'); // markers stripped
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
