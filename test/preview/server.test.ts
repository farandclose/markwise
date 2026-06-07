import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createPreviewServer } from '../../src/preview/server.js';

const DOC = `# Demo

Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}
-->
`;

let server: Server | null = null;
let dir: string | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function start(doc: string): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'mw-preview-'));
  const file = join(dir, 'demo.md');
  writeFileSync(file, doc, 'utf8');
  server = createPreviewServer(file);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function post(base: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('createPreviewServer', () => {
  it('serves the current file as JSON at /api/doc', async () => {
    const base = await start(DOC);
    const res = await fetch(`${base}/api/doc`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.title).toBe('Demo');
    expect(body.openCount).toBe(1);
    expect(body.notes[0].id).toBe('s1');
    expect(body.html).toContain('data-mw-id="s1"');
  });

  it('includes the agent-handoff ticket in /api/doc', async () => {
    const base = await start(DOC);
    const body = await (await fetch(`${base}/api/doc`)).json();
    expect(body.handoff.waitingCount).toBe(1); // s1 is the agent's turn (brand-new note)
    expect(body.handoff.text).toContain('1 note is waiting on you');
    expect(body.handoff.text).toContain('markwise prompt');
    expect(body.handoff.path).toContain('demo.md');
  });

  it('reflects external edits on the next request (re-reads the file)', async () => {
    const base = await start(DOC);
    writeFileSync(join(dir!, 'demo.md'), '# Changed\n\nNo notes.\n', 'utf8');
    const body = await (await fetch(`${base}/api/doc`)).json();
    expect(body.title).toBe('Changed');
    expect(body.openCount).toBe(0);
  });

  it('404s an unknown path', async () => {
    const base = await start(DOC);
    const res = await fetch(`${base}/nope.txt`);
    expect(res.status).toBe(404);
  });

  it('creates a span comment from a selection and returns the new id', async () => {
    const base = await start(DOC);
    const wStart = DOC.indexOf('Ships'); // wrap "Ships"
    const res = await post(base, '/api/note', { kind: 'span', start: wStart, end: wStart + 5, body: 'fix this' });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.createdId).toBe('n1'); // mintId always mints nN; DOC's only id is "s1"
    expect(payload.openCount).toBe(2);
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).toContain('<!-- mw:n1 -->Ships<!-- /mw:n1 -->');
  });

  it('creates a point comment at a gap', async () => {
    const base = await start(DOC);
    const gap = DOC.indexOf('by'); // a clean inter-word gap, not inside the s1 span
    const res = await post(base, '/api/note', { kind: 'point', start: gap, body: 'here' });
    expect(res.status).toBe(200);
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(/"kind":"point"/.test(onDisk)).toBe(true);
  });

  it('rejects a zero-width span selection (400) and leaves the file byte-identical', async () => {
    const base = await start(DOC);
    const original = readFileSync(join(dir!, 'demo.md'), 'utf8');
    const res = await post(base, '/api/note', { kind: 'span', start: 5, end: 5, body: 'x' });
    expect(res.status).toBe(400);
    expect(readFileSync(join(dir!, 'demo.md'), 'utf8')).toBe(original);
    // The 422 lint-gate itself is shared persist() behavior, already covered by the reply/resolve tests.
  });

  it('rejects an empty body', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { kind: 'point', start: 3, body: '  ' });
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized kind (400)', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { kind: 'paragraph', start: 3, end: 8, body: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed JSON body (400)', async () => {
    const base = await start(DOC);
    const res = await fetch(`${base}/api/note`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{',
    });
    expect(res.status).toBe(400);
  });
});

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

  it('refuses to write (422) and leaves the file untouched when the result would not lint', async () => {
    const BAD = [
      '# Demo',
      '',
      'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
      '',
      '<!-- mw:log v=1',
      '{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}',
      '{"id":"s1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[]}',
      '-->',
      '',
    ].join('\n');
    const base = await start(BAD);
    const before = readFileSync(join(dir!, 'demo.md'), 'utf8');
    const res = await post(base, '/api/note/s1/reply', { body: 'hi' });
    expect(res.status).toBe(422);
    expect(readFileSync(join(dir!, 'demo.md'), 'utf8')).toBe(before);
  });
});

describe('suggest-delete endpoints', () => {
  it('creates a delete suggestion over a span and keeps the text in the file', async () => {
    const base = await start(DOC);
    const wStart = DOC.indexOf('Ships');
    const res = await post(base, '/api/note', { type: 'delete', kind: 'span', start: wStart, end: wStart + 5 });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.createdId).toBe('n1');
    const note = payload.notes.find((n: { id: string }) => n.id === 'n1');
    expect(note.type).toBe('delete');
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).toContain('<!-- mw:n1 -->Ships<!-- /mw:n1 -->'); // text stays; it is a suggestion
    expect(onDisk).toContain('"type":"delete"');
  });

  it('rejects a point delete (400) and leaves the file byte-identical', async () => {
    const base = await start(DOC);
    const before = readFileSync(join(dir!, 'demo.md'), 'utf8');
    const res = await post(base, '/api/note', { type: 'delete', kind: 'point', start: 3 });
    expect(res.status).toBe(400);
    expect(readFileSync(join(dir!, 'demo.md'), 'utf8')).toBe(before);
  });

  it('rejects an unsupported type (400)', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { type: 'replace', kind: 'span', start: 3, end: 8, body: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST /api/note/:id/discard removes the note and restores the prose', async () => {
    const base = await start(DOC);
    const wStart = DOC.indexOf('Ships');
    await post(base, '/api/note', { type: 'delete', kind: 'span', start: wStart, end: wStart + 5 });
    const res = await post(base, '/api/note/n1/discard');
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.openCount).toBe(1); // back to just s1
    expect(payload.html).not.toContain('data-mw-id="n1"');
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).not.toContain('mw:n1');
    expect(onDisk).not.toContain('mw:archive'); // discarded, not archived
    expect(onDisk).toContain('Ships'); // prose restored
  });

  it('404s a discard of an unknown note id', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note/nope/discard');
    expect(res.status).toBe(404);
  });
});
