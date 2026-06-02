import { basename } from 'node:path';
import { extractNotes } from './notes.js';
import { renderDocumentHtml } from './render.js';
import type { DocPayload } from './types.js';

function firstH1(source: string): string | undefined {
  for (const line of source.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Pure assembler for GET /api/doc: title + rendered HTML + the open notes (document order) + count.
 * Resolved notes are excluded from the rail and the counter in v0 (the archive browse view is
 * deferred - spec section 14); their markers are normally already stripped from the prose on resolve.
 */
export function buildDocPayload(source: string, filePath: string): DocPayload {
  const open = extractNotes(source).filter((n) => n.state === 'open');
  return {
    title: firstH1(source) ?? basename(filePath),
    html: renderDocumentHtml(source),
    notes: open,
    openCount: open.length,
  };
}
