import { parse } from './parse.js';
import { shortHash } from './hash.js';

// `lint --fix` repairs MECHANICAL fields only (D38): a span's `hash` and a note's `before`/`after`
// context. It never touches prose, disp, state, threads, or text. Records are canonical JSONL, so
// we re-serialize only the lines whose anchor actually changed - everything else is byte-stable.

const MARKER_STRIP_RE = /<!--\s*\/?mw:[A-Za-z0-9][A-Za-z0-9_-]*\s*-->/g;
const stripMarkers = (s: string): string => s.replace(MARKER_STRIP_RE, '');

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export interface FixResult {
  output: string;
  /** Human-readable summary of each mechanical change applied. */
  changes: string[];
}

export function fixText(source: string): FixResult {
  const doc = parse(source);
  const lines = [...doc.lines];
  const changes: string[] = [];

  // Group markers by id (start vs close), so we can locate each note's anchored region.
  const starts = new Map<string, { offset: number; end: number; inCodeFence: boolean }>();
  const closes = new Map<string, { offset: number; end: number }>();
  for (const m of doc.markers) {
    if (m.isClose) {
      if (!closes.has(m.id)) closes.set(m.id, { offset: m.offset, end: m.end });
    } else if (!starts.has(m.id)) {
      starts.set(m.id, { offset: m.offset, end: m.end, inCodeFence: m.inCodeFence });
    }
  }

  for (const b of doc.blocks) {
    if (b.name !== 'log') continue;
    for (const r of b.records) {
      if (!isObj(r.json)) continue;
      const obj = r.json;
      const id = str(obj.id);
      const anchor = obj.anchor;
      if (!id || !isObj(anchor)) continue;
      const start = starts.get(id);
      if (!start || start.inCodeFence) continue;
      const close = closes.get(id);

      let touched = false;

      // hash: spans only.
      if (str(anchor.kind) === 'span' && close && str(anchor.hash) !== undefined) {
        const wrapped = stripMarkers(source.slice(start.end, close.offset));
        const correct = shortHash(wrapped);
        if (anchor.hash !== correct) {
          anchor.hash = correct;
          touched = true;
          changes.push(`${id}: hash -> ${correct}`);
        }
      }

      // before: the prose immediately preceding the start marker, same length as stored.
      const storedBefore = str(anchor.before);
      if (storedBefore !== undefined) {
        const window = stripMarkers(source.slice(0, start.offset));
        const want = window.slice(-storedBefore.length || window.length);
        if (storedBefore.length > 0 && !window.endsWith(storedBefore) && want !== storedBefore) {
          anchor.before = want;
          touched = true;
          changes.push(`${id}: before refreshed`);
        }
      }

      // after: the prose immediately following the end marker (close for a span, else the point).
      const storedAfter = str(anchor.after);
      if (storedAfter !== undefined) {
        const endAt = close ? close.end : start.end;
        const window = stripMarkers(source.slice(endAt));
        const want = window.slice(0, storedAfter.length);
        if (storedAfter.length > 0 && !window.startsWith(storedAfter) && want !== storedAfter) {
          anchor.after = want;
          touched = true;
          changes.push(`${id}: after refreshed`);
        }
      }

      if (touched) lines[r.line - 1] = JSON.stringify(obj);
    }
  }

  return { output: lines.join('\n'), changes };
}
