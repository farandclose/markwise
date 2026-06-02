// Public library entry point (spec section 13 / DECISIONS D40). The CLI and a future web view /
// extension import the Markwise core from here rather than reaching into individual modules. Pure
// functions only - no I/O, no process access.
export { parse } from './parse.js';
export type {
  ParsedDoc,
  ParsedBlock,
  ParsedMarker,
  StrayRecord,
  RawRecordLine,
  BlockName,
  BlockForm,
} from './parse.js';

export { lintText } from './lint.js';
export type { LintOptions } from './lint.js';

export { fixText } from './fix.js';
export type { FixResult } from './fix.js';

export { stripText } from './strip.js';

export { status } from './status.js';
export type { StatusReport, NoteStatus } from './status.js';

export { shortHash } from './hash.js';

export type {
  NoteType,
  ReviewState,
  Disposition,
  AnchorKind,
  Anchor,
  Speaker,
  ThreadMessage,
  LogRecord,
  ArchiveRecord,
  Finding,
  Severity,
} from './types.js';
