import { parse } from '../parse.js';
import type { ThreadMessage } from '../types.js';
import { shortHash } from '../hash.js';

/** Raised when a mutation cannot be applied. `status` is the HTTP status the server should send. */
export class NoteMutationError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = 'NoteMutationError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Append a reviewer message to note `id`'s thread. Pure string transform: parses the file, finds the
 * record in the single `mw:log` block, appends `{by:'reviewer', at, body}` to its thread, and
 * re-serializes only that record's line (every other byte is preserved). `at` is an ISO timestamp
 * supplied by the caller so this stays deterministic for tests.
 */
export function appendReply(source: string, id: string, body: string, at: string): string {
  const text = body.trim();
  if (text === '') throw new NoteMutationError('reply body is empty', 400);

  const doc = parse(source);
  const log = doc.blocks.find((b) => b.name === 'log');
  if (!log) throw new NoteMutationError('document has no mw:log block', 404);

  const rec = log.records.find((r) => isObj(r.json) && r.json.id === id);
  if (!rec || !isObj(rec.json)) throw new NoteMutationError(`note not found: ${id}`, 404);

  const obj = rec.json;
  const existing: unknown[] = Array.isArray(obj.thread) ? obj.thread : [];
  const message: ThreadMessage = { by: 'reviewer', at, body: text };
  const updated = { ...obj, thread: [...existing, message] };

  const lines = [...doc.lines];
  lines[rec.line - 1] = JSON.stringify(updated);
  return lines.join('\n');
}

/**
 * Collapse a thread's opening message to a one-line archive summary (<= 80 chars, with a trailing
 * ellipsis when truncated). Falls back to 'Resolved' when there is no usable opening message.
 */
function deriveSummary(thread: unknown): string {
  const first =
    Array.isArray(thread) && isObj(thread[0]) && typeof thread[0].body === 'string'
      ? (thread[0].body as string)
      : '';
  const oneLine = first.replace(/\s+/g, ' ').trim();
  if (oneLine === '') return 'Resolved';
  // slice(0, 79): 79 + the 1-char ellipsis keeps the summary within 80 chars.
  return oneLine.length > 80 ? oneLine.slice(0, 79).trimEnd() + '…' : oneLine;
}

/**
 * Resolve note `id`: strip its inline marker(s) from the prose (leaving any wrapped text as plain
 * prose), remove its record from `mw:log`, and add a compact record to `mw:archive` (creating that
 * block if absent). If resolving empties the log block, the block itself is removed. Pure string
 * transform; `at` is the caller-supplied ISO resolution time.
 */
export function resolveNote(source: string, id: string, at: string): string {
  const doc = parse(source);
  const log = doc.blocks.find((b) => b.name === 'log');
  if (!log) throw new NoteMutationError('document has no mw:log block', 404);

  const rec = log.records.find((r) => isObj(r.json) && r.json.id === id);
  if (!rec || !isObj(rec.json)) throw new NoteMutationError(`note not found: ${id}`, 404);
  const obj = rec.json;
  if (obj.state !== 'open') throw new NoteMutationError(`note is not open: ${id}`, 409);

  const archiveRec = JSON.stringify({
    id,
    type: obj.type,
    state: 'resolved',
    at,
    summary: deriveSummary(obj.thread),
  });

  // Phase 1: remove this note's inline markers from the prose, right-to-left so offsets stay valid.
  const mine = doc.markers.filter((m) => m.id === id).sort((a, b) => b.offset - a.offset);
  let stripped = source;
  for (const m of mine) stripped = stripped.slice(0, m.offset) + stripped.slice(m.end);

  // Phase 2: drop the resolved record from mw:log and add it to mw:archive. Re-parse the
  // marker-stripped text so block and record line numbers are accurate.
  const doc2 = parse(stripped);
  const log2 = doc2.blocks.find((b) => b.name === 'log')!;
  const rec2 = log2.records.find((r) => isObj(r.json) && r.json.id === id)!;
  const archive = doc2.blocks.find((b) => b.name === 'archive');
  const lines = stripped.split('\n');

  // If this was the only record, drop the entire (now empty) log block instead of leaving a husk.
  const logEmpties = log2.records.length === 1;
  const dropFrom = logEmpties ? log2.openerLine : rec2.line;
  const dropTo = logEmpties ? log2.closeLine ?? log2.lastLine : rec2.line;

  const out: string[] = [];
  let appended = false;
  for (let n = 1; n <= lines.length; n++) {
    if (n >= dropFrom && n <= dropTo) continue; // drop the resolved record (or the empty log block)
    if (archive && n === archive.closeLine) {
      out.push(archiveRec); // insert just before the existing archive's close line
      appended = true;
    }
    out.push(lines[n - 1]!);
  }
  if (!appended) {
    // No archive block existed: create one at the end of the file.
    while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop();
    out.push('', '<!-- mw:archive v=1', archiveRec, '-->');
  }
  return out.join('\n');
}

const MARKER_RE = /<!--\s*\/?mw:[A-Za-z0-9][A-Za-z0-9_-]*\s*-->/g;
const stripMarkers = (s: string): string => s.replace(MARKER_RE, '');
const CONTEXT_WINDOW = 16; // chars of before/after context stored on a new anchor

/** Smallest unused id of the form `nN`, scanning record ids across every block (log + archive). */
function mintId(source: string): string {
  const used = new Set<string>();
  for (const b of parse(source).blocks) {
    for (const r of b.records) {
      if (isObj(r.json) && typeof r.json.id === 'string') used.add(r.json.id);
    }
  }
  let n = 1;
  while (used.has(`n${n}`)) n++;
  return `n${n}`;
}

/** Insert `recordJson` as the first record line of the mw:log block, creating the block if absent. */
function insertLogRecord(source: string, recordJson: string): string {
  const doc = parse(source);
  const log = doc.blocks.find((b) => b.name === 'log');
  const lines = source.split('\n');
  if (log) {
    // openerLine is 1-based; as a 0-based splice index it inserts immediately after the opener line.
    lines.splice(log.openerLine, 0, recordJson);
    return lines.join('\n');
  }
  // No log block: create one at the end of the file.
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop();
  out.push('', '<!-- mw:log v=1', recordJson, '-->');
  return out.join('\n');
}

/**
 * Create a brand-new reviewer `comment` note. Inserts the marker(s) into the prose and a COMPLETE
 * record (before/after context + span hash computed directly from the source) into mw:log, then
 * returns the new text and the minted id. The record is built correct so the persist pipeline's
 * fixText/lintText are a pure safety net. Pure transform; `at` is the caller-supplied ISO time.
 */
export function createNote(
  source: string,
  opts: { kind: 'point' | 'span'; start: number; end?: number; body: string; at: string }
): { output: string; id: string } {
  const body = opts.body.trim();
  if (body === '') throw new NoteMutationError('comment body is empty', 400);
  const { kind, start } = opts;
  if (!Number.isInteger(start) || start < 0 || start > source.length) {
    throw new NoteMutationError('selection start out of range', 400);
  }
  const end = opts.end;
  if (kind === 'span' && (!Number.isInteger(end) || end! <= start || end! > source.length)) {
    throw new NoteMutationError('selection end out of range', 400);
  }
  // All inputs validated; now do the work (mintId parses the whole document).
  const id = mintId(source);
  const before = stripMarkers(source.slice(0, start)).slice(-CONTEXT_WINDOW);
  const open = `<!-- mw:${id} -->`;

  let withMarkers: string;
  let anchor: Record<string, unknown>;
  if (kind === 'span') {
    const wrapped = source.slice(start, end!);
    // Refuse a selection that straddles an existing marker: wrapping it would interleave fences,
    // which lint does not catch for comment notes. (Reachable only via a multi-run Cmd+Option+M
    // selection; the native double-click stays within one text run.)
    if (stripMarkers(wrapped) !== wrapped) {
      throw new NoteMutationError('selection would wrap an existing note marker', 400);
    }
    const after = stripMarkers(source.slice(end!)).slice(0, CONTEXT_WINDOW);
    const close = `<!-- /mw:${id} -->`;
    withMarkers = source.slice(0, start) + open + wrapped + close + source.slice(end!);
    anchor = { kind: 'span', hash: shortHash(stripMarkers(wrapped)), before, after };
  } else {
    const after = stripMarkers(source.slice(start)).slice(0, CONTEXT_WINDOW);
    withMarkers = source.slice(0, start) + open + source.slice(start);
    anchor = { kind: 'point', before, after };
  }

  const record = {
    id,
    type: 'comment',
    state: 'open',
    disp: 'none',
    anchor,
    thread: [{ by: 'reviewer', at: opts.at, body }],
  };
  return { output: insertLogRecord(withMarkers, JSON.stringify(record)), id };
}
