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
}
