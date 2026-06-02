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
