import { fixText } from '../fix.js';
import { lintText } from '../lint.js';
import { shortHash } from '../hash.js';
import { buildDocPayload } from './payload.js';
import { NoteMutationError } from './mutate.js';
import type { DocPayload } from './types.js';

/** Inputs to one save: the freshly-read source, the caller's asserted version, and how to write. */
export interface PersistContext {
  /** Absolute path of the document (used for the payload's title fallback). */
  filePath: string;
  /** The current document source, EOL-normalized to LF by the caller's read. */
  source: string;
  /** The version (shortHash of the source the caller last saw) the mutation was built against. */
  expectedVersion: string | undefined;
  /** Persist the new LF-normalized text. The caller owns EOL re-application and the actual write. */
  write: (text: string) => void;
}

/**
 * The one save sequence, shared by the localhost preview server and the VS Code extension:
 * version-gate -> transform -> fixText -> lintText -> write. The caller injects the freshly-read
 * `source` and a `write` closure so each transport owns its own I/O and end-of-line handling, while
 * the gate / stabilize / validate / "never persist an invalid document" guarantees live here in one
 * place so the two callers cannot drift. Throws NoteMutationError (carrying an HTTP-style status) on
 * a missing or stale precondition, on bad mutation input, or on a mutation that would not lint.
 */
export function persistDocument(
  ctx: PersistContext,
  transform: (src: string) => string
): DocPayload {
  const { filePath, source, expectedVersion, write } = ctx;
  if (expectedVersion === undefined || expectedVersion === '') {
    throw new NoteMutationError('missing x-mw-version header (reload the page)', 428);
  }
  if (shortHash(source) !== expectedVersion) {
    throw new NoteMutationError('document changed on disk since the page loaded', 409);
  }
  const mutated = transform(source); // throws NoteMutationError on bad input
  const fixed = fixText(mutated).output;
  const findings = lintText(fixed);
  if (findings.some((f) => f.severity === 'error')) {
    throw new NoteMutationError(
      'the change would produce an invalid document; run `markwise lint` on the file first',
      422
    );
  }
  write(fixed);
  return buildDocPayload(fixed, filePath);
}
