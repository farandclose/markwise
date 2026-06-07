import { basename } from 'node:path';
import { extractNotes } from './notes.js';
import { renderDocumentHtml } from './render.js';
import { status } from '../status.js';
import { buildHandoffText } from './handoff.js';
import type { DocPayload } from './types.js';

// Same inline-marker shape stripped in fix.ts / lint.ts. A comment can anchor a word inside the
// H1 (e.g. `# Product <!-- mw:n8 -->Brief<!-- /mw:n8 -->`); without this the raw markers leak into
// the page/tab title.
const MARKER_STRIP_RE = /<!--\s*\/?mw:[A-Za-z0-9][A-Za-z0-9_-]*\s*-->/g;

function firstH1(source: string): string | undefined {
  for (const line of source.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(MARKER_STRIP_RE, '').trim() || undefined;
  }
  return undefined;
}

/**
 * Pure assembler for GET /api/doc: title + rendered HTML + the open notes (document order) + count
 * + the agent-handoff ticket.
 * Resolved notes are excluded from the rail and the counter in v0 (the archive browse view is
 * deferred - spec section 14); their markers are normally already stripped from the prose on resolve.
 */
export function buildDocPayload(source: string, filePath: string): DocPayload {
  const open = extractNotes(source).filter((n) => n.state === 'open');
  const waitingCount = status(source).waitingOnAgent.length;
  return {
    title: firstH1(source) ?? basename(filePath),
    html: renderDocumentHtml(source),
    notes: open,
    openCount: open.length,
    handoff: {
      path: filePath,
      waitingCount,
      text: buildHandoffText({ path: filePath, waitingCount }),
    },
  };
}
