import { describe, it, expect } from 'vitest';
import { persistDocument, shortHash } from 'markwise';
import type { DocPayload } from 'markwise';
import { handleApiRequest, type HandlerDeps } from '../../src/requestHandler';
import { sanitizeDocumentHtml } from '../../src/sanitize';
import { parseInboundMessage } from '../../src/messages';

const SAMPLE = '# Plan\n\nThe quick brown fox.\n';

// A persist closure backed by an in-memory store, using the real engine persist - so these tests
// exercise the full route -> validate -> engine -> sanitize path headless, the same path the panel
// runs in the host.
function makeDeps(initial = SAMPLE): { deps: HandlerDeps; store: { source: string } } {
  const store = { source: initial };
  const deps: HandlerDeps = {
    read: () => store.source,
    filePath: '/tmp/plan.md',
    sanitizeHtml: sanitizeDocumentHtml,
    now: () => '2026-01-01T00:00:00Z',
    persist: (version, transform) =>
      persistDocument(
        { filePath: '/tmp/plan.md', source: store.source, expectedVersion: version, write: (t) => { store.source = t; } },
        transform
      ),
  };
  return { deps, store };
}

const req = (raw: unknown) => parseInboundMessage(raw)!;

describe('handleApiRequest', () => {
  it('GET /api/doc renders a formatted, sanitized payload', async () => {
    const { deps } = makeDeps();
    const res = await handleApiRequest(req({ type: 'apiRequest', id: 1, method: 'GET', url: '/api/doc' }), deps);
    expect(res.ok).toBe(true);
    const payload = res.body as DocPayload;
    expect(payload.title).toBe('Plan');
    expect(payload.html).toMatch(/<h1[^>]*>/);
    expect(payload.html).not.toContain('# Plan');
    expect(payload.version).toBe(shortHash(SAMPLE));
  });

  it('GET /api/doc sanitizes hostile markup in the source', async () => {
    const { deps } = makeDeps('# T\n\n<img src=x onerror="alert(1)"> hi\n');
    const res = await handleApiRequest(req({ type: 'apiRequest', id: 1, method: 'GET', url: '/api/doc' }), deps);
    const payload = res.body as DocPayload;
    expect(payload.html).not.toContain('onerror');
  });

  it('POST /api/note creates a comment and persists it, returning the new id', async () => {
    const { deps, store } = makeDeps();
    const res = await handleApiRequest(
      req({
        type: 'apiRequest',
        id: 2,
        method: 'POST',
        url: '/api/note',
        version: shortHash(SAMPLE),
        body: { kind: 'span', start: 11, end: 16, type: 'comment', body: 'why?' },
      }),
      deps
    );
    expect(res.ok).toBe(true);
    const body = res.body as DocPayload & { createdId: string };
    expect(body.createdId).toBeTruthy();
    expect(body.openCount).toBe(1);
    expect(store.source).toContain('mw:log'); // the note was written into the file
  });

  it('POST reply persists into the thread', async () => {
    const { deps, store } = makeDeps();
    // create first
    const created = (await handleApiRequest(
      req({ type: 'apiRequest', id: 1, method: 'POST', url: '/api/note', version: shortHash(store.source), body: { kind: 'span', start: 11, end: 16, type: 'comment', body: 'q' } }),
      deps
    )).body as DocPayload & { createdId: string };
    const res = await handleApiRequest(
      req({ type: 'apiRequest', id: 2, method: 'POST', url: `/api/note/${created.createdId}/reply`, version: shortHash(store.source), body: { body: 'an answer' } }),
      deps
    );
    expect(res.ok).toBe(true);
    expect(store.source).toContain('an answer');
  });

  it('rejects a stale version with a 409 and no write', async () => {
    const { deps, store } = makeDeps();
    const before = store.source;
    const res = await handleApiRequest(
      req({ type: 'apiRequest', id: 3, method: 'POST', url: '/api/note', version: 'stale', body: { kind: 'span', start: 11, end: 16, type: 'comment', body: 'x' } }),
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(store.source).toBe(before);
  });

  it('rejects an invalid note field with a 400', async () => {
    const { deps } = makeDeps();
    const res = await handleApiRequest(
      req({ type: 'apiRequest', id: 4, method: 'POST', url: '/api/note', version: shortHash(SAMPLE), body: { kind: 'nope' } }),
      deps
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it('returns 503 for mutations when no persist is wired (U3 read-only)', async () => {
    const deps: HandlerDeps = {
      read: () => SAMPLE,
      filePath: '/tmp/plan.md',
      sanitizeHtml: sanitizeDocumentHtml,
      now: () => '2026-01-01T00:00:00Z',
    };
    const res = await handleApiRequest(
      req({ type: 'apiRequest', id: 5, method: 'POST', url: '/api/note', body: { kind: 'span', start: 0, end: 1 } }),
      deps
    );
    expect(res.status).toBe(503);
  });

  it('returns 404 for an unknown route', async () => {
    const { deps } = makeDeps();
    const res = await handleApiRequest(req({ type: 'apiRequest', id: 6, method: 'GET', url: '/api/nope' }), deps);
    expect(res.status).toBe(404);
  });
});
