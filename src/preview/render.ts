import MarkdownIt from 'markdown-it';
import { parse } from '../parse.js';
import { extractNotes } from './notes.js';
import type { NoteView } from './types.js';

// Matches a whole mw:log / mw:archive comment block (single HTML comment ending at its first
// `-->`; clean records never contain `-->`, enforced by lint L130). Same pattern strip.ts uses.
const BLOCK_RE = /<!--\s*mw:(?:log|archive)\b[\s\S]*?-->/g;

const escapeAttr = (s: string): string => s.replace(/"/g, '&quot;');

/**
 * Turn a Markwise source string into markdown ready for rendering: every inline `mw:` marker that
 * belongs to a known note becomes a highlight `<span>` (the easy, read-only direction), and the
 * `mw:log` / `mw:archive` blocks are removed. Markers inside fenced code are left as literal text
 * (parse() flags them). A marker with no matching record — including one sitting inside an inline
 * code span, which parse() does NOT flag as in-fence — is also left untouched as literal text,
 * rather than deleted, so code samples and stray markers survive verbatim. Pure string transform;
 * offsets come from the shared parser so code-fence awareness is exactly the linter's.
 */
export function injectMarkerSpans(source: string, notes: NoteView[]): string {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const doc = parse(source);

  // Build replacements keyed by absolute offset, then apply right-to-left so earlier offsets stay
  // valid as we splice.
  const edits: Array<{ offset: number; end: number; text: string }> = [];
  for (const m of doc.markers) {
    if (m.inCodeFence) continue;
    const note = byId.get(m.id);
    if (!note) continue; // orphan / inline-code marker: leave as literal text (don't delete)
    const typeClass = `mw-type-${note.type}`;
    if (note.anchorKind === 'point') {
      edits.push({
        offset: m.offset,
        end: m.end,
        text: `<span class="mw-point ${typeClass}" data-mw-id="${escapeAttr(m.id)}"></span>`,
      });
    } else {
      edits.push({
        offset: m.offset,
        end: m.end,
        text: m.isClose
          ? '</span>'
          : `<span class="mw-span ${typeClass}" data-mw-id="${escapeAttr(m.id)}">`,
      });
    }
  }

  edits.sort((a, b) => b.offset - a.offset);
  let out = source;
  for (const e of edits) out = out.slice(0, e.offset) + e.text + out.slice(e.end);

  // Remove the log/archive blocks (they hold no inline markers, so this is safe after splicing)
  // and tidy the trailing whitespace the removed block leaves behind.
  out = out.replace(BLOCK_RE, '');
  out = out.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  return out.length > 0 ? out + '\n' : out;
}

// One shared renderer instance. html:true lets the injected <span>s pass through (the document is
// the reviewer's own local file, served only to localhost - see the security note in the plan).
const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

/** Render a Markwise document to display HTML with note-highlight spans in place. */
export function renderDocumentHtml(source: string): string {
  const notes = extractNotes(source);
  return md.render(injectMarkerSpans(source, notes));
}
