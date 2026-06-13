// Line-ending handling for markwise. The parser, hashing, and anchoring assume LF, so user
// documents are normalized to LF on read and the original ending is re-applied on write. This
// confines all CRLF awareness to the I/O boundary; the core never sees `\r`.
import { readFileSync, writeFileSync } from 'node:fs';

export type Eol = '\r\n' | '\n';

/**
 * The file's dominant line ending. CRLF when `\r\n` occurrences are at least as many as lone-LF
 * occurrences and at least one CRLF is present (ties favor CRLF); otherwise LF. A file with no
 * line endings is LF. Pure-CRLF and pure-LF files - the overwhelming majority - are unambiguous.
 */
export function detectEol(source: string): Eol {
  let crlf = 0;
  let lf = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      if (i > 0 && source[i - 1] === '\r') crlf++;
      else lf++;
    }
  }
  return crlf > 0 && crlf >= lf ? '\r\n' : '\n';
}

/** Normalize any line ending to LF: `\r\n` -> `\n`, then any lone `\r` -> `\n`. */
export function toLf(source: string): string {
  return source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Re-apply an ending to LF `text`. For CRLF, `\n` -> `\r\n`. Assumes `text` is already LF. */
export function applyEol(text: string, eol: Eol): string {
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

/** Read a user document: returns it normalized to LF plus its original ending for write-back. */
export function readDocument(file: string): { source: string; eol: Eol } {
  const raw = readFileSync(file, 'utf8');
  return { source: toLf(raw), eol: detectEol(raw) };
}

/** Write a user document, re-applying its original ending to the LF `text`. */
export function writeDocument(file: string, text: string, eol: Eol): void {
  writeFileSync(file, applyEol(text, eol), 'utf8');
}
