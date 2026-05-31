import { parse } from './parse.js';

// `markwise status` - the human-facing review summary. It answers "whose turn is it?" for every
// open note using D34's "who spoke last" rule, plus simple open/resolved counts. Pure
// `string -> data` (no I/O), so the CLI, a future web view, and any extension share it (D40).
//
// Turn rule (D34): for an OPEN note, if the agent's reply is the last thread message it is the
// reviewer's turn (resolve or push back); if the reviewer spoke last, or the note is brand-new,
// it is the agent's turn. `disp` is only a label here - it flavors the reason text, it does not
// decide the turn.

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export interface NoteStatus {
  id: string;
  type: string;
  reason: string;
}

export interface StatusReport {
  total: number;
  open: number;
  resolved: number;
  waitingOnYou: NoteStatus[];
  waitingOnAgent: NoteStatus[];
  /** Subset of waitingOnYou where the agent asked a question (disp needs_clarification). */
  needsClarification: number;
}

export function status(source: string): StatusReport {
  const doc = parse(source);

  const records: Obj[] = [];
  for (const b of doc.blocks) {
    for (const r of b.records) {
      if (isObj(r.json)) records.push(r.json);
    }
  }

  const waitingOnYou: NoteStatus[] = [];
  const waitingOnAgent: NoteStatus[] = [];
  let open = 0;
  let resolved = 0;
  let needsClarification = 0;

  for (const obj of records) {
    const id = str(obj.id) ?? '?';
    const type = str(obj.type) ?? '?';
    const state = str(obj.state);
    const disp = str(obj.disp);

    if (state === 'resolved') {
      resolved++;
      continue;
    }
    open++;

    const thread = Array.isArray(obj.thread) ? obj.thread : [];
    const last = thread.length > 0 ? thread[thread.length - 1] : null;
    const lastBy = isObj(last) ? str(last.by) : null;

    if (lastBy === 'agent') {
      // Reviewer's turn: the agent has responded and is waiting on you.
      let reason: string;
      if (disp === 'needs_clarification') {
        reason = 'agent asked a question';
        needsClarification++;
      } else if (disp === 'declined') {
        reason = 'agent declined; resolve or push back';
      } else if (disp === 'applied') {
        reason = 'agent applied the change; resolve or push back';
      } else if (disp === 'answered') {
        reason = 'agent answered; resolve or reply';
      } else {
        reason = 'agent responded; resolve or reply';
      }
      waitingOnYou.push({ id, type, reason });
    } else {
      // Agent's turn: brand-new note, or you spoke last on top of the agent's action.
      const reason =
        disp === undefined || disp === 'none'
          ? 'new note'
          : 'you replied; agent owes another pass';
      waitingOnAgent.push({ id, type, reason });
    }
  }

  return {
    total: records.length,
    open,
    resolved,
    waitingOnYou,
    waitingOnAgent,
    needsClarification,
  };
}
