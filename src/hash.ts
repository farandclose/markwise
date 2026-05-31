import { createHash } from 'node:crypto';

// The canonical anchor fingerprint. A span's `anchor.hash` is the first 8 hex chars of the
// SHA-256 of the exact text wrapped by its fence markers. Short by design (D24: terse values)
// while still being collision-resistant enough to detect drift (L201). The authoring agent may
// write a placeholder it cannot compute (AUTHOR_PROMPT / D20); `lint --fix` reconciles it here.
export function shortHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8);
}
