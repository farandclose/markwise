// Markwise domain types - the locked record schema (DECISIONS D23-D35) expressed in code,
// plus the lint Finding shape (LINT_SPEC.md). These types describe the *intended* shape;
// the parser and rules deliberately accept `unknown`/loose input and validate against them,
// because lint's whole job is to catch records that do NOT conform.

export type NoteType = 'comment' | 'insert' | 'delete' | 'replace';
export const NOTE_TYPES: readonly NoteType[] = ['comment', 'insert', 'delete', 'replace'];

export type ReviewState = 'open' | 'resolved'; // D34: resolve is terminal, no `reopened`
export const REVIEW_STATES: readonly ReviewState[] = ['open', 'resolved'];

export type Disposition = 'none' | 'applied' | 'answered' | 'declined' | 'needs_clarification'; // D35
export const DISPOSITIONS: readonly Disposition[] = [
  'none',
  'applied',
  'answered',
  'declined',
  'needs_clarification',
];

export type AnchorKind = 'span' | 'point';

export interface Anchor {
  kind: AnchorKind;
  hash?: string; // span only (D26)
  before: string;
  after: string;
}

export type Speaker = 'reviewer' | 'agent';

export interface ThreadMessage {
  by: Speaker;
  at: string;
  body: string;
}

/** A record as it lives in the `mw:log` block. */
export interface LogRecord {
  id: string;
  type: NoteType;
  state: ReviewState;
  disp: Disposition;
  anchor: Anchor;
  text?: string; // present for insert/replace only (D27)
  thread: ThreadMessage[];
}

/** A record as it lives in the `mw:archive` block - intentionally lossy/compact (D19, D29). */
export interface ArchiveRecord {
  id: string;
  type: NoteType;
  state: ReviewState; // always `resolved`
  at: string;
  summary: string;
}

// ---- Lint findings -------------------------------------------------------

export type Severity = 'error' | 'warning';

export interface Finding {
  rule: string; // e.g. 'L101'
  severity: Severity;
  message: string;
  /** 1-based line number in the source file, when the finding localizes to a line. */
  line?: number;
  /** Note id, when the finding is about a specific note. */
  id?: string;
  /** True if `--fix` can mend this finding mechanically (D38). */
  fixable?: boolean;
}
