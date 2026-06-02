import { parse } from '../parse.js';
import type { ThreadMessage } from '../types.js';

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
  const thread = Array.isArray(obj.thread) ? (obj.thread as ThreadMessage[]) : [];
  const message: ThreadMessage = { by: 'reviewer', at, body: text };
  obj.thread = [...thread, message];

  const lines = [...doc.lines];
  lines[rec.line - 1] = JSON.stringify(obj);
  return lines.join('\n');
}
