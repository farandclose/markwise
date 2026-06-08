import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { extractNotes } from './notes.js';
import type { NoteView } from './types.js';

interface RenderEnv {
  openById: Map<string, NoteView>;
}

const escapeAttr = (s: string): string => s.replace(/"/g, '&quot;');

// A single inline marker: `<!-- mw:ID -->` (start/point) or `<!-- /mw:ID -->` (close).
const MARKER_ONE = /^<!--\s*(\/?)mw:([A-Za-z0-9][A-Za-z0-9_-]*)\s*-->$/;

/** Absolute start offset of every line in `source`. */
function lineStartOffsets(source: string): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const line of source.split('\n')) {
    out.push(acc);
    acc += line.length + 1; // +1 for the '\n' split removed
  }
  return out;
}

/**
 * Annotate each inline `text` token with its absolute [s,e) source range. For each inline block we
 * anchor to the block's first source line via `token.map`, then a cursor + indexOf for each run
 * (text / code / html-comment content) steps over **bold**, [links](url), `code`, and <!-- markers
 * --> without needing to know their syntax lengths. Naive indexOf can miss runs containing
 * backslash-escapes or HTML entities (rare in prose); those runs are simply left without a
 * breadcrumb, which only means they cannot start a note - acceptable for the thin slice.
 */
function annotateInlineOffsets(tokens: Token[], source: string): void {
  const ls = lineStartOffsets(source);
  for (const t of tokens) {
    if (t.type !== 'inline' || !t.map) continue;
    const base = ls[t.map[0]]!;
    const blockEnd = ls[t.map[1]] ?? source.length;
    const slice = source.slice(base, blockEnd);
    let cursor = 0;
    for (const c of t.children ?? []) {
      let needle: string | null = null;
      if ((c.type === 'text' || c.type === 'code_inline' || c.type === 'html_inline') && c.content) {
        needle = c.content;
      }
      if (needle == null) continue;
      const at = slice.indexOf(needle, cursor);
      if (at < 0) continue;
      if (c.type === 'text') c.meta = { s: base + at, e: base + at + needle.length };
      cursor = at + needle.length;
    }
  }
}

/** Convert a single `mw:` marker comment to its highlight span. Returns null if not a marker. */
function convertMarker(raw: string, env: RenderEnv): string | null {
  const m = MARKER_ONE.exec(raw.trim());
  if (!m) return null;
  const isClose = m[1] === '/';
  const id = m[2]!;
  const note = env.openById.get(id);
  if (!note) return raw; // orphan / resolved / unknown: leave the literal comment
  if (isClose) {
    // A committed, open replace shows its proposed text inline, right after the struck original
    // (spec 2026-06-08-previewer-replace-inline-display). The text lives in the note record, not the
    // prose; it is escaped as content here and hidden in clean read mode by CSS. The replacement span
    // carries the same data-mw-id so it activates with - and highlights alongside - the original.
    // Comment/delete/insert (and replace with no text) close plainly.
    if (note.type === 'replace' && note.text) {
      return `</span><span class="mw-replace-text" data-mw-id="${escapeAttr(id)}">${md.utils.escapeHtml(note.text)}</span>`;
    }
    return '</span>';
  }
  const typeClass = `mw-type-${note.type}`;
  if (note.anchorKind === 'point') {
    return `<span class="mw-point ${typeClass}" data-mw-id="${escapeAttr(id)}"></span>`;
  }
  return `<span class="mw-span ${typeClass}" data-mw-id="${escapeAttr(id)}">`;
}

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

// CommonMark begins an HTML comment block at any line starting with `<!--`. A note anchored to a
// whole paragraph puts its opening marker at the line start, which would otherwise swallow the
// prose as a raw block - losing the highlight span and the breadcrumb runs the comment pill needs.
// Decline html_block for a "marker + prose" line so the paragraph rule parses it instead; the
// markers then surface as html_inline tokens (converted below) and the text keeps its breadcrumbs.
// A bare marker line, mw:log / mw:archive blocks, and real HTML fall through to the original rule.
const MW_OPENS_LINE = /^<!--\s*\/?mw:[A-Za-z0-9][A-Za-z0-9_-]*\s*-->(.*)$/;
// markdown-it exposes block rules only via the internal __rules__ array; cast to reach it.
const blockRuler = md.block.ruler as unknown as {
  __rules__: Array<{ name: string; fn: (...a: unknown[]) => boolean }>;
  at: (name: string, fn: (...a: unknown[]) => boolean) => void;
};
const defaultHtmlBlock = blockRuler.__rules__.find((r) => r.name === 'html_block')!.fn;
blockRuler.at('html_block', (...args) => {
  const [state, startLine] = args as [
    { src: string; bMarks: number[]; eMarks: number[]; tShift: number[] },
    number,
  ];
  const start = state.bMarks[startLine]! + state.tShift[startLine]!;
  const lineText = state.src.slice(start, state.eMarks[startLine]!);
  const m = MW_OPENS_LINE.exec(lineText);
  if (m && m[1]!.trim() !== '') return false; // fused marker + prose: let the paragraph rule run
  return defaultHtmlBlock(...args);
});

// Wrap every text run in an offset breadcrumb (escaped exactly like the default text rule).
md.renderer.rules.text = (tokens, idx) => {
  const t = tokens[idx]!;
  const esc = md.utils.escapeHtml(t.content);
  const meta = t.meta as { s: number; e: number } | undefined;
  return meta ? `<span class="mw-run" data-s="${meta.s}" data-e="${meta.e}">${esc}</span>` : esc;
};

// Inline marker comments become highlight spans; non-marker inline HTML passes through.
md.renderer.rules.html_inline = (tokens, idx, _opts, env) => {
  const conv = convertMarker(tokens[idx]!.content, env as RenderEnv);
  return conv ?? tokens[idx]!.content;
};

// Drop mw:log / mw:archive blocks; convert a standalone block-position marker; else pass through.
md.renderer.rules.html_block = (tokens, idx, _opts, env) => {
  const content = tokens[idx]!.content;
  if (/^\s*<!--\s*mw:(log|archive)\b/.test(content)) return '';
  const conv = convertMarker(content, env as RenderEnv);
  return conv ?? content;
};

/** Render a Markwise document to display HTML: breadcrumb runs + highlight spans for OPEN notes. */
export function renderDocumentHtml(source: string): string {
  const open = extractNotes(source).filter((n) => n.state === 'open');
  const env: RenderEnv = { openById: new Map(open.map((n) => [n.id, n])) };
  const tokens = md.parse(source, env);
  annotateInlineOffsets(tokens, source);
  return md.renderer.render(tokens, md.options, env);
}
