# Previewer Mutation v0 (Reply + Resolve) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer reply to and resolve the agent's notes from the localhost previewer, writing the same `mw:` protocol records an agent would write by hand.

**Architecture:** Two new POST endpoints on the existing preview server call pure string transforms in a new `src/preview/mutate.ts` module (reply appends a thread message; resolve strips the note's markers from the prose and moves its record from `mw:log` to `mw:archive`). Every mutation flows through one pipeline: read the file fresh, apply the transform, re-stabilize anchors with `fixText`, validate with `lintText`, and only write if the result has no error-level findings, so a mutation can never persist a corrupt file. The browser repaints by re-fetching `GET /api/doc` after each successful mutation.

**Tech Stack:** TypeScript (ESM, NodeNext), Node's built-in `http`/`fs`, vitest, vanilla browser JS/CSS (no framework, no bundler). Reuses existing pure functions: `parse`, `fixText`, `lintText`, `shortHash`.

**Spec:** `docs/superpowers/specs/2026-06-02-previewer-mutation-reply-resolve-design.md`. Parent design: `docs/superpowers/specs/2026-06-01-previewer-ui-design.md` (sections 6 and 9).

**Test/build commands:**
- Run one test file: `pnpm exec vitest run <path>`
- Run the whole suite: `pnpm exec vitest run`
- Full build (compiles and copies assets): `pnpm build`

---

## File Structure

- **Create `src/preview/mutate.ts`** - pure string transforms `appendReply(source, id, body, at)` and `resolveNote(source, id, at)`, plus the `NoteMutationError` class. No I/O. Tasks 1-2.
- **Create `test/preview/mutate.test.ts`** - unit tests for the transforms. Tasks 1-2.
- **Modify `src/preview/render.ts`** - paint highlights for open notes only. Task 3.
- **Modify `test/preview/render.test.ts`** - add the resolved-note assertion. Task 3.
- **Modify `src/preview/server.ts`** - add the two POST routes, the `persist` pipeline, and a JSON body reader. Task 4.
- **Modify `test/preview/server.test.ts`** - endpoint tests. Task 4.
- **Modify `src/preview/assets/app.js`** - wire Reply and Resolve, add a `load()` repaint path, surface errors. Task 5.
- **Modify `src/preview/assets/app.css`** - per-speaker thread styling and a small toast. Task 6.

---

## Task 1: `mutate.ts` - the reply transform

**Files:**
- Create: `src/preview/mutate.ts`
- Test: `test/preview/mutate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/preview/mutate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { appendReply, NoteMutationError } from '../../src/preview/mutate.js';

const DOC = [
  '# Demo',
  '',
  'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
  '',
  '<!-- mw:log v=1',
  '{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"Suggest Q4."}]}',
  '-->',
  '',
].join('\n');

describe('appendReply', () => {
  it('appends a reviewer message to the note thread', () => {
    const out = appendReply(DOC, 's1', 'Agreed, use Q4.', '2026-06-02T12:00:00Z');
    const recLine = out.split('\n').find((l) => l.trim().startsWith('{"id":"s1"'))!;
    const rec = JSON.parse(recLine);
    expect(rec.thread).toHaveLength(2);
    expect(rec.thread[1]).toEqual({ by: 'reviewer', at: '2026-06-02T12:00:00Z', body: 'Agreed, use Q4.' });
  });

  it('trims the body and rejects an empty reply', () => {
    expect(() => appendReply(DOC, 's1', '   ', '2026-06-02T12:00:00Z')).toThrow(NoteMutationError);
  });

  it('rejects an unknown note id with a 404 status', () => {
    try {
      appendReply(DOC, 'nope', 'hi', '2026-06-02T12:00:00Z');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NoteMutationError);
      expect((e as NoteMutationError).status).toBe(404);
    }
  });

  it('leaves prose and other lines untouched', () => {
    const out = appendReply(DOC, 's1', 'ok', '2026-06-02T12:00:00Z');
    expect(out).toContain('Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/preview/mutate.test.ts`
Expected: FAIL - cannot resolve `../../src/preview/mutate.js` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/preview/mutate.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/preview/mutate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/preview/mutate.ts test/preview/mutate.test.ts
git commit -m "$(cat <<'EOF'
Add appendReply mutation transform (previewer M2)

Pure string transform: append a reviewer message to a note's mw:log
thread, re-serializing only that record line. Rejects empty bodies and
unknown ids via NoteMutationError carrying an HTTP status.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `mutate.ts` - the resolve transform

**Files:**
- Modify: `src/preview/mutate.ts`
- Test: `test/preview/mutate.test.ts:1` (add cases)

- [ ] **Step 1: Write the failing test**

Append these cases to `test/preview/mutate.test.ts` (add `resolveNote` to the import on line 2 so it reads `import { appendReply, resolveNote, NoteMutationError } from '../../src/preview/mutate.js';`):

```ts
describe('resolveNote', () => {
  const SPAN = [
    '# Demo',
    '',
    'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
    '',
    'Keep.<!-- mw:p2 -->',
    '',
    '<!-- mw:log v=1',
    '{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"Change Q3 to Q4 for accuracy."}]}',
    '{"id":"p2","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"Keep this one."}]}',
    '-->',
    '',
  ].join('\n');

  it('strips a span note\'s markers and moves the record to a new mw:archive block', () => {
    const out = resolveNote(SPAN, 's1', '2026-06-02T12:00:00Z');
    // Markers gone, wrapped text remains as plain prose.
    expect(out).toContain('Ships by Q3.');
    expect(out).not.toContain('mw:s1');
    // s1 is no longer an OPEN log record (its proposed text is gone from the file; the archive
    // record carries no `text` field, so this substring uniquely identifies the removed log line).
    expect(out).not.toContain('"text":"Q4"');
    // An archive block now holds the resolved record with an auto summary.
    expect(out).toContain('<!-- mw:archive v=1');
    const arcLine = out.split('\n').find((l) => l.trim().startsWith('{"id":"s1"'))!;
    const arc = JSON.parse(arcLine);
    expect(arc).toEqual({
      id: 's1',
      type: 'replace',
      state: 'resolved',
      at: '2026-06-02T12:00:00Z',
      summary: 'Change Q3 to Q4 for accuracy.',
    });
    // The untouched note p2 is still an open log record.
    expect(out).toContain('"id":"p2"');
    expect(out).toContain('mw:p2');
  });

  it('strips a point note\'s single marker', () => {
    const POINT = [
      '# Demo',
      '',
      'Done.<!-- mw:p1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"reviewer","at":"2026-06-01T10:00:00Z","body":"Add a closing line."}]}',
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(POINT, 'p1', '2026-06-02T12:00:00Z');
    expect(out).toContain('Done.');
    expect(out).not.toContain('mw:p1');
    expect(out).toContain('<!-- mw:archive v=1');
  });

  it('appends to an existing archive block instead of creating a second one', () => {
    const WITH_ARCHIVE = [
      '# Demo',
      '',
      'Done.<!-- mw:p1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"reviewer","at":"2026-06-01T10:00:00Z","body":"Tighten this."}]}',
      '-->',
      '',
      '<!-- mw:archive v=1',
      '{"id":"old","type":"comment","state":"resolved","at":"2026-05-01T00:00:00Z","summary":"earlier note"}',
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(WITH_ARCHIVE, 'p1', '2026-06-02T12:00:00Z');
    expect(out.match(/<!-- mw:archive v=1/g)).toHaveLength(1);
    expect(out).toContain('"id":"old"');
    expect(out).toContain('"id":"p1"');
  });

  it('truncates a long summary to one line of 80 chars', () => {
    const longBody = 'x'.repeat(200);
    const LONG = [
      'A.<!-- mw:p1 -->',
      '<!-- mw:log v=1',
      `{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"${longBody}"}]}`,
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(LONG, 'p1', '2026-06-02T12:00:00Z');
    const arc = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{"id":"p1"'))!);
    expect(arc.summary.length).toBe(80);
    expect(arc.summary.endsWith('…')).toBe(true);
  });

  it('rejects resolving a note that is already resolved', () => {
    const RESOLVED = [
      'A.<!-- mw:p1 -->',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"resolved","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[]}',
      '-->',
      '',
    ].join('\n');
    try {
      resolveNote(RESOLVED, 'p1', '2026-06-02T12:00:00Z');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NoteMutationError);
      expect((e as NoteMutationError).status).toBe(409);
    }
  });

  it('drops the whole log block when the last open note is resolved', () => {
    const ONLY = [
      'A.<!-- mw:p1 -->',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"note"}]}',
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(ONLY, 'p1', '2026-06-02T12:00:00Z');
    expect(out).not.toContain('mw:log');
    expect(out).toContain('<!-- mw:archive v=1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/preview/mutate.test.ts`
Expected: FAIL - `resolveNote` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/preview/mutate.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/preview/mutate.test.ts`
Expected: PASS (all reply + resolve cases).

- [ ] **Step 5: Verify the whole module type-checks**

Run: `pnpm build`
Expected: tsc completes with no errors; assets copied.

- [ ] **Step 6: Commit**

```bash
git add src/preview/mutate.ts test/preview/mutate.test.ts
git commit -m "$(cat <<'EOF'
Add resolveNote mutation transform (previewer M2)

Strip a note's markers from the prose, move its record from mw:log to a
compact mw:archive record with an auto-derived one-line summary, create
the archive block when absent, and drop the log block when it empties.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Render highlights for open notes only

**Files:**
- Modify: `src/preview/render.ts:66-69`
- Test: `test/preview/render.test.ts`

This is the M1 follow-up: a resolved note whose marker happens to linger in the prose must not produce a dead, cardless highlight. (Resolve strips markers, so this is defensive.)

- [ ] **Step 1: Write the failing test**

Add to `test/preview/render.test.ts`:

```ts
it('does not paint a highlight for a resolved note that still has a marker', () => {
  const src = [
    '# T',
    '',
    'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
    '',
    '<!-- mw:log v=1',
    '{"id":"s1","type":"replace","state":"resolved","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}',
    '-->',
    '',
  ].join('\n');
  const html = renderDocumentHtml(src);
  expect(html).not.toContain('data-mw-id="s1"');
});
```

(If `renderDocumentHtml` is not already imported in this test file, add it to the existing import from `../../src/preview/render.js`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/preview/render.test.ts`
Expected: FAIL - the resolved note is still highlighted, so the html contains `data-mw-id="s1"`.

- [ ] **Step 3: Write the minimal implementation**

In `src/preview/render.ts`, change `renderDocumentHtml` (currently lines 66-69) to filter to open notes before injecting spans:

```ts
/** Render a Markwise document to display HTML with highlight spans for the OPEN notes only. */
export function renderDocumentHtml(source: string): string {
  const open = extractNotes(source).filter((n) => n.state === 'open');
  return md.render(injectMarkerSpans(source, open));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/preview/render.test.ts`
Expected: PASS. A resolved note's lingering marker is left as a literal HTML comment (invisible in the browser), not a highlight span.

- [ ] **Step 5: Commit**

```bash
git add src/preview/render.ts test/preview/render.test.ts
git commit -m "$(cat <<'EOF'
Render highlights for open notes only (previewer M2)

A resolved note whose marker lingers in the prose no longer produces a
dead, cardless highlight; its marker is left as an invisible HTML
comment instead. Defensive: resolve already strips markers.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Server - reply and resolve endpoints with the write pipeline

**Files:**
- Modify: `src/preview/server.ts`
- Test: `test/preview/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/preview/server.test.ts` (the existing `DOC` constant has an open `replace` note `s1`; reuse it). Add a helper to POST:

```ts
async function post(base: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('mutation endpoints', () => {
  it('POST /api/note/:id/reply appends a reviewer message and returns the fresh payload', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note/s1/reply', { body: 'Looks good.' });
    expect(res.status).toBe(200);
    const payload = await res.json();
    const note = payload.notes.find((n: { id: string }) => n.id === 's1');
    const last = note.thread[note.thread.length - 1];
    expect(last.by).toBe('reviewer');
    expect(last.body).toBe('Looks good.');
    // The on-disk file reflects the change.
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).toContain('Looks good.');
  });

  it('POST /api/note/:id/resolve strips the note and drops the open count', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note/s1/resolve');
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.openCount).toBe(0);
    expect(payload.html).not.toContain('data-mw-id="s1"');
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).toContain('<!-- mw:archive v=1');
    expect(onDisk).not.toContain('mw:s1');
  });

  it('rejects an empty reply body and leaves the file untouched', async () => {
    const base = await start(DOC);
    const before = readFileSync(join(dir!, 'demo.md'), 'utf8');
    const res = await post(base, '/api/note/s1/reply', { body: '   ' });
    expect(res.status).toBe(400);
    expect(readFileSync(join(dir!, 'demo.md'), 'utf8')).toBe(before);
  });

  it('404s a reply to an unknown note id', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note/nope/reply', { body: 'hi' });
    expect(res.status).toBe(404);
  });
});
```

Add `readFileSync` to the existing `node:fs` import at the top of the file (it currently imports `mkdtempSync, writeFileSync, rmSync`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/preview/server.test.ts`
Expected: FAIL - POST routes return 404 (not implemented), so the assertions fail.

- [ ] **Step 3: Write the minimal implementation**

Edit `src/preview/server.ts`. Update the imports at the top to add the pipeline pieces:

```ts
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { buildDocPayload } from './payload.js';
import type { DocPayload } from './types.js';
import { fixText } from '../fix.js';
import { lintText } from '../lint.js';
import { appendReply, resolveNote, NoteMutationError } from './mutate.js';
```

Add these helpers above `createPreviewServer`:

```ts
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read and JSON-parse a request body. Empty body -> {}. Caps size and rejects invalid JSON. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new NoteMutationError('request body too large', 413));
    });
    req.on('end', () => {
      if (data.trim() === '') return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new NoteMutationError('invalid JSON body', 400));
      }
    });
    req.on('error', reject);
  });
}

/**
 * The one write path: read the file fresh, apply `transform`, re-stabilize anchors with fixText,
 * validate with lintText, and write only if there are no error-level findings. Never persists a
 * file that would not lint. Returns the fresh payload for the browser to repaint from.
 */
function persist(filePath: string, transform: (src: string) => string): DocPayload {
  const source = readFileSync(filePath, 'utf8');
  const mutated = transform(source); // throws NoteMutationError on bad input
  const fixed = fixText(mutated).output;
  const findings = lintText(fixed);
  if (findings.some((f) => f.severity === 'error')) {
    throw new NoteMutationError(
      'the change would produce an invalid document; run `markwise lint` on the file first',
      422
    );
  }
  writeFileSync(filePath, fixed, 'utf8');
  return buildDocPayload(fixed, filePath);
}
```

Inside the `createServer` callback, add the POST branch immediately after `const url = new URL(...)` and before the `GET /api/doc` branch:

```ts
      const mutateRoute = /^\/api\/note\/([^/]+)\/(reply|resolve)$/.exec(url.pathname);
      if (req.method === 'POST' && mutateRoute) {
        const id = decodeURIComponent(mutateRoute[1]!);
        const verb = mutateRoute[2]!;
        try {
          const now = new Date().toISOString();
          let payload: DocPayload;
          if (verb === 'reply') {
            const parsed = await readJsonBody(req);
            const body = isObj(parsed) && typeof parsed.body === 'string' ? parsed.body : '';
            payload = persist(filePath, (src) => appendReply(src, id, body, now));
          } else {
            payload = persist(filePath, (src) => resolveNote(src, id, now));
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(payload));
        } catch (err) {
          const status = err instanceof NoteMutationError ? err.status : 500;
          const message = err instanceof Error ? err.message : 'error';
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: message }));
        }
        return;
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/preview/server.test.ts`
Expected: PASS (existing GET tests plus the four new mutation tests).

- [ ] **Step 5: Run the whole suite and build**

Run: `pnpm exec vitest run && pnpm build`
Expected: all tests pass; build completes.

- [ ] **Step 6: Commit**

```bash
git add src/preview/server.ts test/preview/server.test.ts
git commit -m "$(cat <<'EOF'
Add reply/resolve endpoints with lint-gated write pipeline (M2)

POST /api/note/:id/reply and /resolve call the mutate transforms through
one pipeline: read fresh, transform, fixText, lintText, write only if
clean. Errors carry an HTTP status and leave the file untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Browser - wire Reply and Resolve

**Files:**
- Modify: `src/preview/assets/app.js`

The rail already renders a reply textarea and Reply/Resolve buttons (disabled). This task makes them live and routes every mutation through a single `load()` repaint. Browser JS has no unit harness here; verification is the end-to-end pass in Task 6 plus the existing server tests that already exercise the endpoints.

- [ ] **Step 1: Track the active note id across repaints**

In `app.js`, add a module-level variable near the top of the IIFE (after the `const countEl = ...` line):

```js
  let activeId = null;
```

In `activate(id)`, set it as the first line of the function body:

```js
  function activate(id) {
    activeId = id;
    if (id != null && body.classList.contains('mw-clean')) reveal(true);
    // ...rest unchanged...
  }
```

- [ ] **Step 2: Add the POST helper and a toast**

Add these functions inside the IIFE (e.g. just above `renderRail`):

```js
  function showToast(msg) {
    let t = document.querySelector('.mw-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'mw-toast';
      body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    window.setTimeout(function () { t.classList.remove('show'); }, 3000);
  }

  function send(url, bodyObj) {
    return fetch(url, {
      method: 'POST',
      headers: bodyObj ? { 'content-type': 'application/json' } : {},
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (e) { throw new Error(e.error || 'Request failed'); });
        }
        return r.json();
      })
      .then(function () { return load(); })
      .catch(function (err) { showToast(err.message || 'Action failed'); });
  }
```

- [ ] **Step 3: Build the live actions in `renderRail`**

Replace the disabled-actions block in `renderRail` (currently the `actions.innerHTML = '<textarea ... disabled>...'` assignment) with built, wired controls:

```js
      const actions = document.createElement('div');
      actions.className = 'mw-card-actions';

      const ta = document.createElement('textarea');
      ta.className = 'mw-reply';
      ta.placeholder = 'Reply...';
      ta.addEventListener('click', function (e) { e.stopPropagation(); });

      const verbs = document.createElement('div');
      verbs.className = 'mw-verbs';

      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'mw-reply-btn';
      replyBtn.textContent = 'Reply';
      replyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const text = ta.value.trim();
        if (!text) return;
        replyBtn.disabled = true;
        send('/api/note/' + encodeURIComponent(note.id) + '/reply', { body: text })
          .finally(function () { replyBtn.disabled = false; });
      });

      const resolveBtn = document.createElement('button');
      resolveBtn.type = 'button';
      resolveBtn.className = 'mw-resolve-btn';
      resolveBtn.textContent = 'Resolve';
      resolveBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        resolveBtn.disabled = true;
        send('/api/note/' + encodeURIComponent(note.id) + '/resolve', null);
      });

      verbs.appendChild(replyBtn);
      verbs.appendChild(resolveBtn);
      actions.appendChild(ta);
      actions.appendChild(verbs);
      card.appendChild(actions);
```

- [ ] **Step 4: Turn the one-shot fetch into a reusable `load()`**

Replace the trailing `fetch('/api/doc')...` block at the bottom of the IIFE with a `load()` function, wire prose activation once, then call `load()`:

```js
  function load() {
    return fetch('/api/doc')
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        titleEl.textContent = payload.title || '';
        document.title = (payload.title ? payload.title + ' - ' : '') + 'Markwise Preview';
        docEl.innerHTML = payload.html || '';
        countEl.textContent = String(payload.openCount || 0);
        renderRail(payload.notes || []);
        // Re-apply the active note if it survived the repaint; otherwise clear it.
        if (activeId != null && railEl.querySelector('.mw-card' + idSel(activeId))) {
          activate(activeId);
        } else {
          activeId = null;
        }
      })
      .catch(function (err) {
        docEl.innerHTML = '<p class="mw-error">Could not load the document.</p>';
        console.error('[markwise] failed to load /api/doc', err);
      });
  }

  wireProseActivation();
  load();
```

Note: `wireProseActivation()` must be called once (not inside `load`), because it attaches a delegated click listener to the stable `docEl`; calling it on every repaint would stack duplicate listeners.

- [ ] **Step 5: Rebuild assets and smoke-check**

Run: `pnpm build`
Expected: build completes (this copies the updated `app.js` into `dist/preview/assets/`).

- [ ] **Step 6: Commit**

```bash
git add src/preview/assets/app.js
git commit -m "$(cat <<'EOF'
Wire Reply and Resolve in the previewer browser app (M2)

Enable the per-note reply box and the Reply/Resolve buttons; each
mutation POSTs to the server and repaints from a single load() path that
preserves the active note. Failures surface as a transient toast.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Styling - per-speaker thread + toast, and end-to-end check

**Files:**
- Modify: `src/preview/assets/app.css`

- [ ] **Step 1: Add per-speaker thread styling and the toast**

Append to `src/preview/assets/app.css`:

```css
/* Per-speaker thread distinction (M2): the reviewer's own messages read stronger than the agent's */
.mw-msg.mw-by-reviewer { border-left: 2px solid var(--mw-ink); padding-left: 8px; }
.mw-msg.mw-by-agent { border-left: 2px solid var(--mw-line); padding-left: 8px; }
.mw-msg.mw-by-reviewer .mw-msg-by { color: var(--mw-ink); }
.mw-msg.mw-by-agent .mw-msg-by { color: var(--mw-muted); }

/* Live verb buttons (M2) */
.mw-verbs button { cursor: pointer; }
.mw-verbs button:disabled { opacity: 0.5; cursor: default; }
.mw-resolve-btn { border-color: var(--mw-ink); }

/* Transient action feedback (M2) */
.mw-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #111;
  color: #fff;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  z-index: 10;
}
.mw-toast.show { opacity: 1; }
```

- [ ] **Step 2: Rebuild assets**

Run: `pnpm build`
Expected: build completes; updated CSS in `dist/preview/assets/`.

- [ ] **Step 3: End-to-end verification in a real browser**

Create a scratch document and drive a full reply + resolve cycle:

```bash
cat > /tmp/mw-m2.md <<'EOF'
# M2 Check

Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> of next year.

Final paragraph.<!-- mw:p2 -->

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":" of"},"text":"Q4","thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"Suggest Q4 for accuracy."}]}
{"id":"p2","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"Anything to add here?"}]}
-->
EOF
node dist/cli.js preview /tmp/mw-m2.md
```

In the opened page, verify:
- The counter shows `2 notes`. Click it to reveal; two cards appear.
- Click the `s1` card, type a reply, click **Reply**: the message appears under "reviewer", the textarea clears, the counter stays `2`.
- Click **Resolve** on `s1`: the `Q3` highlight disappears (text remains "Ships by Q3 of next year."), the card leaves the rail, the counter drops to `1`.
- Open `/tmp/mw-m2.md` in an editor: `s1` is now in a `mw:archive` block with a `summary` of "Suggest Q4 for accuracy."; `p2` is still an open `mw:log` record.

Stop the server (Ctrl+C) and clean up: `rm -f /tmp/mw-m2.md`.

- [ ] **Step 4: Final full build + suite**

Run: `pnpm exec vitest run && pnpm build`
Expected: all tests green; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/preview/assets/app.css
git commit -m "$(cat <<'EOF'
Style per-speaker thread messages and action toast (M2)

Distinguish reviewer vs agent messages in a thread, style the live verb
buttons, and add a transient toast for mutation feedback.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final Review (after all tasks)

Dispatch a final whole-branch reviewer covering:
- **Spec coverage:** Reply (spec section 6) and Resolve (sections 6 and 9) both implemented end to end; the lint-gated write model (design section 1) is the only write path; the two M1 follow-ups (open-only highlights, per-speaker styling) are present.
- **Safety:** confirm no mutation path bypasses `persist` (so nothing writes without the lint gate); confirm error responses leave the file byte-identical.
- **No regressions:** the full vitest suite passes and `pnpm build` is clean.

Then use **superpowers:finishing-a-development-branch** to merge.

---

## Self-Review (plan author)

**Spec coverage:**
- Design section 1 (write architecture / lint gate) -> Task 4 `persist`.
- Design section 2 (two endpoints) -> Task 4 routes.
- Design section 3 (reply behavior) -> Tasks 1, 4, 5.
- Design section 4 (resolve: strip span vs point, move to archive, auto summary, counter down) -> Tasks 2, 4, 5.
- Design section 5 (browser wiring, refetch, error surface) -> Task 5.
- Design section 6 (open-only highlights, per-speaker styling) -> Tasks 3, 6.
- Design section 7 (testing: unit, endpoint, e2e) -> Tasks 1-4 (unit/endpoint), Task 6 step 3 (e2e).
- Design section 8 (out of scope) -> nothing built for create-note; confirmed absent.

**Type/name consistency:** `appendReply(source, id, body, at)`, `resolveNote(source, id, at)`, and `NoteMutationError(message, status)` are referenced identically in Tasks 1, 2, 4. The server imports `fixText` (returns `{ output }`), `lintText` (returns `Finding[]` with `severity`), and `buildDocPayload` - all matching their real signatures. `load()`, `activeId`, `send()`, `showToast()` are defined before use in Task 5.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every test step shows the assertions; every run step states the expected result.
