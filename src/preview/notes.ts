import { parse } from '../parse.js';
import type { NoteType, ReviewState, Disposition, AnchorKind, ThreadMessage } from '../types.js';
import type { NoteView } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const NOTE_TYPES: readonly string[] = ['comment', 'insert', 'delete', 'replace'];
const STATES: readonly string[] = ['open', 'resolved'];
const DISPS: readonly string[] = ['none', 'applied', 'answered', 'declined', 'needs_clarification'];

function toThread(v: unknown): ThreadMessage[] {
  if (!Array.isArray(v)) return [];
  const out: ThreadMessage[] = [];
  for (const m of v) {
    if (!isObj(m)) continue;
    const by = str(m.by);
    const at = str(m.at);
    const body = str(m.body);
    if ((by === 'reviewer' || by === 'agent') && at !== undefined && body !== undefined) {
      out.push({ by, at, body });
    }
  }
  return out;
}

/**
 * Read every `mw:log` record into a NoteView. Records that are not valid objects, or lack an `id`,
 * are skipped (lint is the safety net for those). The result is sorted in DOCUMENT order - the
 * order the notes' first markers appear in the prose - which is the order the rail shows them
 * (spec section 5). Notes whose marker is missing sort to the end, preserving log order among them.
 */
export function extractNotes(source: string): NoteView[] {
  const doc = parse(source);

  // First marker offset per id, for document-order sorting.
  const firstOffset = new Map<string, number>();
  for (const m of doc.markers) {
    if (!firstOffset.has(m.id)) firstOffset.set(m.id, m.offset);
  }

  const notes: NoteView[] = [];
  for (const b of doc.blocks) {
    if (b.name !== 'log') continue;
    for (const r of b.records) {
      if (!isObj(r.json)) continue;
      const o = r.json;
      const id = str(o.id);
      if (id === undefined) continue;

      const type: NoteType = NOTE_TYPES.includes(str(o.type) ?? '') ? (o.type as NoteType) : 'comment';
      const state: ReviewState = STATES.includes(str(o.state) ?? '') ? (o.state as ReviewState) : 'open';
      const disp: Disposition = DISPS.includes(str(o.disp) ?? '') ? (o.disp as Disposition) : 'none';
      const anchorKind: AnchorKind =
        isObj(o.anchor) && str(o.anchor.kind) === 'point' ? 'point' : 'span';
      const text = str(o.text);

      notes.push({ id, type, anchorKind, state, disp, text, thread: toThread(o.thread) });
    }
  }

  const ORPHAN = Number.MAX_SAFE_INTEGER;
  return notes
    .map((n, i) => ({ n, i, off: firstOffset.get(n.id) ?? ORPHAN }))
    .sort((a, b) => a.off - b.off || a.i - b.i)
    .map((x) => x.n);
}
