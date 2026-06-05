import type { NoteType, ReviewState, Disposition, AnchorKind, ThreadMessage } from '../types.js';

/** A note reduced to what the previewer needs to render it. Derived from a `mw:log` LogRecord. */
export interface NoteView {
  id: string;
  type: NoteType;
  anchorKind: AnchorKind;
  state: ReviewState;
  disp: Disposition;
  /** Present for insert/replace (the proposed new text). */
  text?: string;
  thread: ThreadMessage[];
}

/** The agent-handoff pickup ticket surfaced on GET /api/doc (design 2026-06-05). */
export interface HandoffInfo {
  /** The path `markwise preview` was launched with. */
  path: string;
  /** Open notes that are the agent's turn (status.waitingOnAgent.length). */
  waitingCount: number;
  /** The handoff pickup-ticket text built by buildHandoffText. */
  text: string;
}

/** The JSON the server returns from GET /api/doc. */
export interface DocPayload {
  /** Document title: the first H1, else the file's basename. */
  title: string;
  /** The document rendered to HTML, with mw: markers turned into highlight spans. */
  html: string;
  /** Open notes only, in document order. */
  notes: NoteView[];
  /** Count of open notes (== notes.length; sent explicitly for the counter). */
  openCount: number;
  /** The "Hand to agent" clipboard bundle and its enable state. */
  handoff: HandoffInfo;
}
