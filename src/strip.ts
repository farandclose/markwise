// `markwise export` / `strip` - produce a clean, shareable copy of a document with ALL Markwise
// data removed: the mw:log / mw:archive blocks and every inline marker (the wrapped prose stays).
// This is the first-class sharing-safety workflow (D10): because mw: comments are invisible in
// normal preview, a file can carry hidden review feedback into a share by accident.
//
// Pure `string -> string`. The CLI prints the result to stdout or --output and never edits the
// original, so stripping can never destroy review state.

export function stripText(source: string): string {
  let out = source;

  // 1. Remove the mw:log / mw:archive comment blocks (each is one HTML comment ending at its
  //    first `-->`; clean records never contain `-->`, which lint enforces via L130).
  out = out.replace(/<!--\s*mw:(?:log|archive)\b[\s\S]*?-->/g, '');

  // 2. Remove inline markers (open, close, and point), keeping the text they wrapped.
  out = out.replace(/<!--\s*\/?mw:[A-Za-z0-9][A-Za-z0-9_-]*\s*-->/g, '');

  // 3. Tidy up the seams: drop trailing whitespace, collapse runs of blank lines left behind by
  //    removed blocks, and end with exactly one newline.
  out = out.replace(/[ \t]+$/gm, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.replace(/\s+$/, '');
  return out.length > 0 ? out + '\n' : out;
}
