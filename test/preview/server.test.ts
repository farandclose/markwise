import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
