import {
  buildDocPayload,
  createNote,
  appendReply,
  resolveNote,
  discardNote,
  NoteMutationError,
} from 'markwise';
import type { DocPayload } from 'markwise';
import type { ApiRequestMessage } from './messages';

// The host-side router for bridged previewer API calls. It is the postMessage analogue of
// src/preview/server.ts: same routes, same field validation, same NoteMutationError -> status
// mapping - but transport-agnostic and pure, so it is fully unit-testable headless. All I/O is
// injected (read / persist / handoff / now), and every payload's HTML is sanitized before it leaves
// (KTD6, R7). Keep this in lockstep with server.ts so the webview and the browser behave identically.

export interface ApiResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface HandlerDeps {
  /** The document's current source, LF-normalized (open editor buffer or disk - the caller decides). */
  read: () => string;
  /** Absolute path, for the payload's title fallback. */
  filePath: string;
  /** Allowlist-sanitize the rendered document HTML before it crosses to the webview. */
  sanitizeHtml: (html: string) => string;
  /** ISO timestamp source (injected so the handler stays pure/testable). */
  now: () => string;
  /**
   * The shared persist (U1's persistDocument wrapped with VS Code I/O closures by U4): version-gate
   * against the same surface, transform, fixText, lintText, write. Absent in U3 (no save wiring yet)
   * -> mutations return 503.
   */
  persist?: (expectedVersion: string | undefined, transform: (src: string) => string) => DocPayload;
  /** The in-process handoff (U6). Absent until wired -> /api/handoff returns 503. */
  handoff?: () => Promise<ApiResult>;
}

const NOTE_VERBS = /^\/api\/note\/([^/]+)\/(reply|resolve|discard)$/;

export async function handleApiRequest(
  req: ApiRequestMessage,
  deps: HandlerDeps
): Promise<ApiResult> {
  const sanitized = (p: DocPayload): DocPayload => ({ ...p, html: deps.sanitizeHtml(p.html) });

  try {
    // GET /api/doc - re-read and render the current document.
    if (req.method === 'GET' && req.url === '/api/doc') {
      const payload = buildDocPayload(deps.read(), deps.filePath);
      return { ok: true, status: 200, body: sanitized(payload) };
    }

    if (req.method === 'POST' && req.url === '/api/handoff') {
      if (!deps.handoff) return { ok: false, status: 503, body: { error: 'handoff not available' } };
      return await deps.handoff();
    }

    if (req.method === 'POST') {
      if (!deps.persist) return { ok: false, status: 503, body: { error: 'saving not available' } };
      const body = req.body ?? {};

      // POST /api/note - create a comment / suggestion.
      if (req.url === '/api/note') {
        const kind = body.kind;
        if (kind !== 'point' && kind !== 'span') {
          throw new NoteMutationError('kind must be "point" or "span"', 400);
        }
        const rawType = typeof body.type === 'string' ? body.type : 'comment';
        if (rawType !== 'comment' && rawType !== 'insert' && rawType !== 'delete' && rawType !== 'replace') {
          throw new NoteMutationError('type must be "comment", "insert", "delete", or "replace"', 400);
        }
        const type: 'comment' | 'insert' | 'delete' | 'replace' = rawType;
        const start = typeof body.start === 'number' ? body.start : NaN;
        const end = typeof body.end === 'number' ? body.end : undefined;
        const noteBody = typeof body.body === 'string' ? body.body : '';
        const text = typeof body.text === 'string' ? body.text : undefined;
        const now = deps.now();
        let createdId = '';
        const payload = deps.persist(req.version, (src) => {
          const r = createNote(src, { kind, start, end, body: noteBody, at: now, type, text });
          createdId = r.id;
          return r.output;
        });
        return { ok: true, status: 200, body: { ...sanitized(payload), createdId } };
      }

      // POST /api/note/:id/(reply|resolve|discard)
      const m = NOTE_VERBS.exec(req.url);
      if (m) {
        const id = decodeURIComponent(m[1]!);
        const verb = m[2]!;
        const now = deps.now();
        let payload: DocPayload;
        if (verb === 'reply') {
          const replyBody = typeof body.body === 'string' ? body.body : '';
          payload = deps.persist(req.version, (src) => appendReply(src, id, replyBody, now));
        } else if (verb === 'discard') {
          payload = deps.persist(req.version, (src) => discardNote(src, id));
        } else {
          payload = deps.persist(req.version, (src) => resolveNote(src, id, now));
        }
        return { ok: true, status: 200, body: sanitized(payload) };
      }
    }

    return { ok: false, status: 404, body: { error: 'not found' } };
  } catch (err) {
    const status = err instanceof NoteMutationError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'error';
    return { ok: false, status, body: { error: message } };
  }
}
