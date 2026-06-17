// The waiter half of the live handoff. `markwise prompt <file> --wait` calls this to block until the
// human clicks "Hand to agent" in the running preview, WITHOUT shutting that preview down (it keeps
// serving so the human can watch the agent work). It finds the preview via the rendezvous advert,
// then long-polls GET /api/handoff/wait: each request returns {handoff:true} the instant the doorbell
// rings, or {handoff:false} on a keep-waiting timeout (re-poll). If the preview goes away, it stops.

import { readRendezvous } from './rendezvous.js';

export type WaitResult =
  | 'handed' // the human clicked "Hand to agent"
  | 'no-preview' // no live preview is running for this file
  | 'gone'; // the preview was running but disappeared mid-wait

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// A run of failed connections to the advertised port means the preview is gone - even when the
// stale-advert pid guard is fooled by pid reuse (the reused pid is "alive", but nothing is
// listening on the port). Bounding the run guarantees the waiter returns 'gone' instead of spinning.
const MAX_CONSECUTIVE_FAILURES = 5;
// A bit above the server's 25s long-poll hold, so a healthy keep-waiting cycle never trips it but a
// half-open socket (laptop sleep, Wi-Fi drop) cannot hang the waiter indefinitely.
const FETCH_TIMEOUT_MS = 30_000;

export async function waitForHandoff(
  file: string,
  opts: { retryMs?: number } = {}
): Promise<WaitResult> {
  const rdv = readRendezvous(file);
  if (!rdv) return 'no-preview';

  const waitUrl = `http://127.0.0.1:${rdv.port}/api/handoff/wait`;
  const retryMs = opts.retryMs ?? 250;
  let failures = 0;

  for (;;) {
    let serverHeld = false; // a clean 200 long-poll the server paced for us (no extra backoff needed)
    try {
      const res = await fetch(waitUrl, {
        headers: { 'x-mw-handoff': '1' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        serverHeld = true;
        failures = 0;
        const body = (await res.json()) as { handoff?: boolean };
        if (body.handoff === true) return 'handed';
      }
    } catch {
      // Connection refused/reset/timeout: the preview likely stopped. A run of these means it is
      // gone (this also covers pid reuse, where the advert's liveness check can be fooled).
      failures++;
      if (failures >= MAX_CONSECUTIVE_FAILURES || !readRendezvous(file)) return 'gone';
      await sleep(retryMs);
      continue;
    }
    // Not handed yet. Stop if the advert is gone; otherwise loop. A non-OK response returned
    // instantly (unlike the server-paced 200 hold), so back off to avoid a hot loop.
    if (!readRendezvous(file)) return 'gone';
    if (!serverHeld) await sleep(retryMs);
  }
}
