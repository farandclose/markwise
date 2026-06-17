// A running `markwise preview` binds a dynamic port, so a separate `markwise prompt --wait` process
// has no way to find it from the command line alone. The preview advertises its port in a small temp
// file (the "rendezvous"), keyed by a hash of the document's ABSOLUTE path so two previews of
// different docs never collide and `--wait <file>` always resolves to the right server. I/O is
// best-effort and localhost-only, matching the previewer's posture (the file lives in the user's own
// temp dir and carries no secret - just a loopback port).

import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { shortHash } from '../hash.js';

export interface Rendezvous {
  /** The loopback port the preview server is listening on. */
  port: number;
  /** The pid of the `markwise preview` process, used to detect a stale advert. */
  pid: number;
  /** Absolute path of the document being previewed. */
  file: string;
}

export function rendezvousPath(file: string): string {
  return join(tmpdir(), `markwise-preview-${shortHash(resolve(file))}.json`);
}

export function writeRendezvous(file: string, info: { port: number; pid: number }): void {
  const data: Rendezvous = { port: info.port, pid: info.pid, file: resolve(file) };
  writeFileSync(rendezvousPath(file), JSON.stringify(data), 'utf8');
}

/** Read the advert for `file`, or null if none exists, it is corrupt, or its process is gone. */
export function readRendezvous(file: string): Rendezvous | null {
  let raw: string;
  try {
    raw = readFileSync(rendezvousPath(file), 'utf8');
  } catch {
    return null; // no preview running for this file
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null; // corrupt advert
  }
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as Rendezvous).port !== 'number' ||
    typeof (data as Rendezvous).pid !== 'number'
  ) {
    return null;
  }
  const rdv = data as Rendezvous;
  // Stale-file guard: a leftover advert from a preview that has since exited points at a dead port.
  if (!isAlive(rdv.pid)) return null;
  return rdv;
}

export function removeRendezvous(file: string): void {
  try {
    rmSync(rendezvousPath(file), { force: true });
  } catch {
    /* best-effort cleanup */
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 is an existence check; it does not actually signal the process
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = it exists but is not ours (still alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
