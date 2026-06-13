import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createPreviewServer } from '../../src/preview/server.js';

const DOC_LF = `# Demo

Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}
-->
`;
const DOC_CRLF = DOC_LF.replace(/\n/g, '\r\n');

let server: Server | null = null;
let dir: string | null = null;
let file = '';

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function start(doc: string): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'mw-crlf-'));
  file = join(dir, 'demo.md');
  writeFileSync(file, doc, 'utf8');
  server = createPreviewServer(file);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function reply(base: string, id: string, body: string): Promise<Response> {
  const version = ((await (await fetch(`${base}/api/doc`)).json()) as { version: string }).version;
  return fetch(`${base}/api/note/${id}/reply`, {
    method: 'POST',
    headers: { 'x-mw-version': version, 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

describe('CRLF documents in the previewer', () => {
  it('reads a CRLF document correctly (notes parse)', async () => {
    const base = await start(DOC_CRLF);
    const body = await (await fetch(`${base}/api/doc`)).json();
    expect(body.notes[0].id).toBe('s1');
    expect(body.openCount).toBe(1);
  });

  it('preserves CRLF when saving a reply', async () => {
    const base = await start(DOC_CRLF);
    const res = await reply(base, 's1', 'Looks good');
    expect(res.status).toBe(200);
    const saved = readFileSync(file, 'utf8');
    expect(saved.includes('\r\n')).toBe(true); // still CRLF
    expect(/[^\r]\n/.test(saved)).toBe(false); // every LF is part of a CRLF (uniform)
    expect(saved).toContain('Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.'); // prose line intact
    expect(saved).toContain('Looks good'); // the reply landed
  });

  it('leaves an LF document as LF when saving a reply', async () => {
    const base = await start(DOC_LF);
    const res = await reply(base, 's1', 'Looks good');
    expect(res.status).toBe(200);
    const saved = readFileSync(file, 'utf8');
    expect(saved.includes('\r')).toBe(false); // still pure LF
    expect(saved).toContain('Looks good');
  });
});
