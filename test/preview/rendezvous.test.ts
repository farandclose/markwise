import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeRendezvous,
  readRendezvous,
  removeRendezvous,
  rendezvousPath,
} from '../../src/preview/rendezvous.js';

const fileA = join(tmpdir(), 'mw-rdv-doc-a.md');
const fileB = join(tmpdir(), 'mw-rdv-doc-b.md');

afterEach(() => {
  removeRendezvous(fileA);
  removeRendezvous(fileB);
});

describe('rendezvous', () => {
  it('round-trips port, pid, and the absolute file path', () => {
    writeRendezvous(fileA, { port: 4321, pid: process.pid });
    const r = readRendezvous(fileA);
    expect(r).not.toBeNull();
    expect(r!.port).toBe(4321);
    expect(r!.pid).toBe(process.pid);
    expect(r!.file).toBe(fileA); // fileA is already absolute (under tmpdir)
  });

  it('keys distinct documents to distinct, stable rendezvous files under tmpdir', () => {
    expect(rendezvousPath(fileA)).not.toBe(rendezvousPath(fileB));
    expect(rendezvousPath(fileA).startsWith(tmpdir())).toBe(true);
    expect(rendezvousPath(fileA)).toBe(rendezvousPath(fileA)); // deterministic
  });

  it('removeRendezvous deletes the advert; readRendezvous then returns null', () => {
    writeRendezvous(fileA, { port: 4321, pid: process.pid });
    expect(existsSync(rendezvousPath(fileA))).toBe(true);
    removeRendezvous(fileA);
    expect(existsSync(rendezvousPath(fileA))).toBe(false);
    expect(readRendezvous(fileA)).toBeNull();
  });

  it('treats a rendezvous whose process is gone as stale (null)', () => {
    writeRendezvous(fileA, { port: 4321, pid: 999999 }); // a pid that is not running
    expect(readRendezvous(fileA)).toBeNull();
  });

  it('returns null when no preview is running for the file', () => {
    expect(readRendezvous(fileB)).toBeNull();
  });
});
