// Pure refresh logic for the file-watch (KTD4, U5), kept free of the vscode API so it is unit-testable
// headless. watch.ts wires a FileSystemWatcher to these.

/**
 * A bounded set of recently-written content hashes used to tell the panel's own saves apart from an
 * agent's external write. Deliberately a *set with an eviction rule*, not a single pending hash: more
 * than one self-write can be in flight before the watcher events arrive.
 *
 * Membership is checked but NOT removed on a hit. The debounced flush reads the *current* disk
 * content and asks whether that content is one of ours: a self-write matches (one OS write can emit
 * several watcher events, and every one of them sees the same self-written content, so all are
 * suppressed); an agent write - even one that interleaves between our write and its event - shows
 * different content that is not in the set, so it still refreshes. The only thing this swallows is an
 * external write whose bytes are identical to a still-unevicted self-write, which the agent never
 * produces in practice (it revises the document) and which the eviction bound caps anyway.
 */
export class SelfWriteSuppressor {
  private readonly hashes: string[] = [];
  constructor(private readonly max = 8) {}

  /** Remember a hash we just wrote (FIFO eviction once `max` is exceeded). */
  record(hash: string): void {
    if (this.hashes.includes(hash)) return;
    this.hashes.push(hash);
    while (this.hashes.length > this.max) this.hashes.shift();
  }

  /** True if `hash` is the content of a recent self-write (membership only; not removed). */
  isSelfWrite(hash: string): boolean {
    return this.hashes.includes(hash);
  }
}

/**
 * Trailing-edge debouncer: coalesces a burst of events into one call `delayMs` after the last one.
 * Uses the ambient setTimeout/clearTimeout so vitest fake timers can drive it deterministically.
 */
export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly delayMs: number, private readonly fn: () => void) {}

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.fn();
    }, this.delayMs);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
