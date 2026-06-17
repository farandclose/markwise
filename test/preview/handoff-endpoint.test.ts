import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, type Server } from 'node:http';
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

async function start(opts?: { handoffWaitMs?: number }): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'mw-handoff-'));
  const file = join(dir, 'demo.md');
  writeFileSync(file, DOC, 'utf8');
  server = createPreviewServer(file, opts);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const H = { 'x-mw-handoff': '1' };

describe('handoff doorbell + long-poll', () => {
  it('GET /api/handoff/wait resolves immediately once the doorbell has rung', async () => {
    const base = await start();
    const post = await fetch(`${base}/api/handoff`, { method: 'POST', headers: H });
    expect(post.status).toBe(200);
    const wait = await fetch(`${base}/api/handoff/wait`, { headers: H });
    expect(wait.status).toBe(200);
    expect((await wait.json()).handoff).toBe(true);
  });

  it('a wait issued before the doorbell unblocks the instant it rings', async () => {
    const base = await start();
    const waitPromise = fetch(`${base}/api/handoff/wait`, { headers: H }).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 30)); // let the long-poll register
    await fetch(`${base}/api/handoff`, { method: 'POST', headers: H });
    expect((await waitPromise).handoff).toBe(true);
  });

  it('a wait with no doorbell returns the keep-waiting status after the timeout', async () => {
    const base = await start({ handoffWaitMs: 40 });
    const body = await (await fetch(`${base}/api/handoff/wait`, { headers: H })).json();
    expect(body.handoff).toBe(false);
  });

  it('POST /api/handoff is idempotent (a second ring is a no-op 200)', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/handoff`, { method: 'POST', headers: H })).status).toBe(200);
    expect((await fetch(`${base}/api/handoff`, { method: 'POST', headers: H })).status).toBe(200);
  });

  it('consumes a latched doorbell: one wait sees it, the next blocks until a fresh ring', async () => {
    const base = await start({ handoffWaitMs: 40 });
    await fetch(`${base}/api/handoff`, { method: 'POST', headers: H }); // no waiter parked -> latched
    const first = await (await fetch(`${base}/api/handoff/wait`, { headers: H })).json();
    expect(first.handoff).toBe(true); // consumes the latch
    const second = await (await fetch(`${base}/api/handoff/wait`, { headers: H })).json();
    expect(second.handoff).toBe(false); // a second round must await a fresh handoff, not re-fire
  });

  it('releasing a parked waiter does not leave a latch for the next round', async () => {
    const base = await start({ handoffWaitMs: 40 });
    const parked = fetch(`${base}/api/handoff/wait`, { headers: H }).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 20)); // let it park
    await fetch(`${base}/api/handoff`, { method: 'POST', headers: H }); // hands straight to the waiter
    expect((await parked).handoff).toBe(true);
    const next = await (await fetch(`${base}/api/handoff/wait`, { headers: H })).json();
    expect(next.handoff).toBe(false); // nothing latched behind it
  });

  it('rejects POST /api/handoff without the x-mw-handoff header (403)', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/handoff`, { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('rejects GET /api/handoff/wait without the x-mw-handoff header (403)', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/handoff/wait`);
    expect(res.status).toBe(403);
  });

  it('refuses any request whose Host is not loopback (DNS rebinding, 403)', async () => {
    // fetch/undici refuses to override Host, so speak raw node:http (closer to a real rebind too).
    const base = await start();
    const { port } = new URL(base);
    const statusFor = (method: string, path: string) =>
      new Promise<number>((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port,
            method,
            path,
            headers: { host: 'evil.example.com', 'x-mw-handoff': '1' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on('error', reject);
        req.end();
      });
    expect(await statusFor('POST', '/api/handoff')).toBe(403);
    expect(await statusFor('GET', '/api/handoff/wait')).toBe(403);
  });
});
