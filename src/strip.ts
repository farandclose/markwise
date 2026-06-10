// `markwise export` / `strip` - produce a clean, shareable copy of a document with ALL Markwise
// data removed: the mw:log / mw:archive blocks and every inline marker (the wrapped prose stays).
// This is the first-class sharing-safety workflow (D10): because mw: comments are invisible in
// normal preview, a file can carry hidden review feedback into a share by accident.
//
// Built on parse() rather than raw regexes so it is code-fence aware: a document that *demonstrates*
// Markwise syntax inside a fenced code block (docs, examples) keeps those fences byte-intact.
// parse() already skips block openers and flags markers inside fences; strip honors both.
//
// Pure `string -> string`. The CLI prints the result to stdout or --output and never edits the
// original, so stripping can never destroy review state.

import { parse } from './parse.js';

export function stripText(source: string): string {
  const doc = parse(source);

  // 1. Remove inline markers that sit in prose (markers inside code fences are example text and
  //    stay). Right-to-left so earlier offsets stay valid. Markers contain no newlines, so the
  //    1-based line numbers parse() computed remain correct for step 2.
  const markers = doc.markers
    .filter((m) => !m.inCodeFence)
    .sort((a, b) => b.offset - a.offset);
  let out = source;
  for (const m of markers) out = out.slice(0, m.offset) + out.slice(m.end);

  // 2. Remove the mw:log / mw:archive blocks, including any stray record lines a self-closed
  //    opener left attached (lastLine covers them).
  const drop = new Set<number>();
  for (const b of doc.blocks) {
    for (let n = b.openerLine; n <= b.lastLine; n++) drop.add(n);
  }
  out = out
    .split('\n')
    .filter((_, i) => !drop.has(i + 1))
    .join('\n');

  // 3. Tidy up the seams: drop trailing whitespace, collapse runs of blank lines left behind by
  //    removed blocks, and end with exactly one newline.
  out = out.replace(/[ \t]+$/gm, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.replace(/\s+$/, '');
  return out.length > 0 ? out + '\n' : out;
}
