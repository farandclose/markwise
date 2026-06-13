import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectEol, toLf, applyEol, readDocument, writeDocument } from '../src/eol.js';

test('detectEol: pure LF', () => {
  expect(detectEol('a\nb\nc')).toBe('\n');
});

test('detectEol: pure CRLF', () => {
  expect(detectEol('a\r\nb\r\nc')).toBe('\r\n');
});

test('detectEol: no line endings defaults to LF', () => {
  expect(detectEol('abc')).toBe('\n');
  expect(detectEol('')).toBe('\n');
});

test('detectEol: mixed favors the dominant ending (ties -> CRLF)', () => {
  expect(detectEol('a\r\nb\r\nc\nd')).toBe('\r\n'); // 2 CRLF vs 1 LF
  expect(detectEol('a\r\nb\nc\nd')).toBe('\n'); // 1 CRLF vs 2 LF
  expect(detectEol('a\r\nb\nc')).toBe('\r\n'); // 1 vs 1 tie -> CRLF
});

test('toLf: converts CRLF and lone CR to LF, idempotent on LF', () => {
  expect(toLf('a\r\nb\r\n')).toBe('a\nb\n');
  expect(toLf('a\rb\rc')).toBe('a\nb\nc'); // lone CR (classic Mac)
  expect(toLf('a\nb\n')).toBe('a\nb\n');
});

test('applyEol: LF passthrough, CRLF round-trips toLf', () => {
  expect(applyEol('a\nb\n', '\n')).toBe('a\nb\n');
  expect(applyEol('a\nb\n', '\r\n')).toBe('a\r\nb\r\n');
  const crlf = 'x\r\ny\r\nz';
  expect(applyEol(toLf(crlf), detectEol(crlf))).toBe(crlf); // exact round-trip
});

test('readDocument normalizes to LF and reports the original ending', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-eol-'));
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, 'a\r\nb\r\nc', 'utf8');
    const { source, eol } = readDocument(file);
    expect(source).toBe('a\nb\nc');
    expect(eol).toBe('\r\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDocument re-applies the ending to LF text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-eol-'));
  try {
    const file = join(dir, 'doc.md');
    writeDocument(file, 'a\nb\nc', '\r\n');
    expect(readFileSync(file, 'utf8')).toBe('a\r\nb\r\nc');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
