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

// Previewer engine surface (DECISIONS D40: exposed at first reuse, for the VS Code extension).
// These are the pure render / payload / mutate / handoff functions the extension imports to drive
// a webview in place of the localhost HTTP server. renderDocumentHtml stays internal - callers use
// buildDocPayload, which wraps it.
export { buildDocPayload } from './preview/payload.js';
export { createNote, appendReply, resolveNote, discardNote, NoteMutationError } from './preview/mutate.js';
export { persistDocument } from './preview/persist.js';
export type { PersistContext } from './preview/persist.js';
export { buildHandoffText } from './preview/handoff.js';
export type { HandoffInput } from './preview/handoff.js';
export type { DocPayload, NoteView, HandoffInfo } from './preview/types.js';
