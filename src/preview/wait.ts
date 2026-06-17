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

export async function waitForHandoff(
  file: string,
  opts: { retryMs?: number } = {}
): Promise<WaitResult> {
  const rdv = readRendezvous(file);
  if (!rdv) return 'no-preview';

  const waitUrl = `http://127.0.0.1:${rdv.port}/api/handoff/wait`;
  const retryMs = opts.retryMs ?? 250;

  for (;;) {
    try {
      const res = await fetch(waitUrl, { headers: { 'x-mw-handoff': '1' } });
      if (res.ok) {
        const body = (await res.json()) as { handoff?: boolean };
        if (body.handoff === true) return 'handed';
      }
    } catch {
      // Connection refused/reset: the preview likely stopped. Confirm via the advert and bail if so,
      // otherwise treat it as transient and retry after a short backoff.
      if (!readRendezvous(file)) return 'gone';
      await sleep(retryMs);
      continue;
    }
    // {handoff:false} keep-waiting (or a non-OK response): loop, but stop if the preview is gone.
    if (!readRendezvous(file)) return 'gone';
  }
}
