import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createPreviewServer } from '../../src/preview/server.js';
import { writeRendezvous, removeRendezvous } from '../../src/preview/rendezvous.js';
import { waitForHandoff } from '../../src/preview/wait.js';

const DOC = `# Demo

Body.
`;

const servers: Server[] = [];
const dirs: string[] = [];
const files: string[] = [];

afterEach(async () => {
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  servers.length = 0;
  for (const f of files) removeRendezvous(f);
  files.length = 0;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

async function startPreview(): Promise<{ base: string; file: string; port: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'mw-wait-'));
  dirs.push(dir);
  const file = join(dir, 'demo.md');
  writeFileSync(file, DOC, 'utf8');
  files.push(file);
  const server = createPreviewServer(file, { handoffWaitMs: 60 });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, file, port };
}

async function freePort(): Promise<number> {
  const s = createNetServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

describe('waitForHandoff', () => {
  it('resolves "handed" when the doorbell rings', async () => {
    const { base, file, port } = await startPreview();
    writeRendezvous(file, { port, pid: process.pid });
    const p = waitForHandoff(file);
    await new Promise((r) => setTimeout(r, 30)); // let the long-poll register
    await fetch(`${base}/api/handoff`, { method: 'POST', headers: { 'x-mw-handoff': '1' } });
    expect(await p).toBe('handed');
  });

  it('returns "no-preview" when no preview is running for the file', async () => {
    const file = join(tmpdir(), 'mw-wait-none.md');
    removeRendezvous(file);
    expect(await waitForHandoff(file)).toBe('no-preview');
  });

  it('returns "gone" when the preview disappears mid-wait', async () => {
    const file = join(tmpdir(), 'mw-wait-gone.md');
    files.push(file);
    const dead = await freePort(); // a port with nothing listening: fetch will be refused
    writeRendezvous(file, { port: dead, pid: process.pid });
    const p = waitForHandoff(file, { retryMs: 20 });
    setTimeout(() => removeRendezvous(file), 60); // the preview "stops" while we are polling
    expect(await p).toBe('gone');
  });
});
