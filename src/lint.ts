import { parse, type ParsedDoc, type ParsedMarker } from './parse.js';
import { shortHash } from './hash.js';
import {
  NOTE_TYPES,
  REVIEW_STATES,
  DISPOSITIONS,
  type Finding,
  type Severity,
} from './types.js';

export interface LintOptions {
  /** Escalate warnings to failures (affects exit code, not the findings list). */
  strict?: boolean;
}

const LOG_REQUIRED = ['id', 'type', 'state', 'disp', 'anchor', 'thread'] as const;
const ARCHIVE_REQUIRED = ['id', 'type', 'state', 'at', 'summary'] as const;
const EDIT_TYPES = new Set(['insert', 'delete', 'replace']);

type Obj = Record<string, unknown>;

interface RecordView {
  line: number;
  obj: Obj;
  block: 'log' | 'archive';
}

const MARKER_STRIP_RE = /<!--\s*\/?mw:[A-Za-z0-9][A-Za-z0-9_-]*\s*-->/g;
const stripMarkers = (s: string): string => s.replace(MARKER_STRIP_RE, '');

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Recursively collect every string value in a JSON value. */
function collectStrings(v: unknown, out: string[]): void {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out);
  else if (isObj(v)) for (const k of Object.keys(v)) collectStrings(v[k], out);
}

export function lintText(source: string, _opts: LintOptions = {}): Finding[] {
  const doc = parse(source);
  const findings: Finding[] = [];
  const add = (rule: string, severity: Severity, message: string, extra: Partial<Finding> = {}) =>
    findings.push({ rule, severity, message, ...extra });

  const logBlocks = doc.blocks.filter((b) => b.name === 'log');
  const archiveBlocks = doc.blocks.filter((b) => b.name === 'archive');

  tierBlockEnvelope(doc, add, logBlocks.length, archiveBlocks.length);

  // Gather object-valued records (and flag invalid JSON, L110).
  const records: RecordView[] = [];
  for (const b of doc.blocks) {
    for (const r of b.records) {
      if (r.json === null) {
        add('L110', 'error', `Invalid JSON record line`, { line: r.line });
        continue;
      }
      if (isObj(r.json)) records.push({ line: r.line, obj: r.json, block: b.name });
    }
  }

  const logRecords = records.filter((r) => r.block === 'log');
  const archiveRecords = records.filter((r) => r.block === 'archive');
  const logRecordIds = new Set(logRecords.map((r) => str(r.obj.id)).filter(Boolean) as string[]);
  const archiveRecordIds = new Set(
    archiveRecords.map((r) => str(r.obj.id)).filter(Boolean) as string[]
  );

  schemaAndValues(records, add);
  duplicateIds(records, add);
  escaping(records, add);
  fenceIntegrity(doc, logRecords, logRecordIds, archiveRecordIds, add);
  anchorHealth(doc, logRecords, add);
  lifecycle(logRecords, archiveRecords, add);

  // Stable order: by line, then rule id.
  findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
  return findings;
}

type AddFn = (rule: string, severity: Severity, message: string, extra?: Partial<Finding>) => void;

// ---- Tier 1: block envelope (L101-L108, L107) ----------------------------
function tierBlockEnvelope(doc: ParsedDoc, add: AddFn, nLog: number, nArchive: number): void {
  const logs = doc.blocks.filter((b) => b.name === 'log');
  const archives = doc.blocks.filter((b) => b.name === 'archive');
  if (nLog > 1)
    for (const b of logs.slice(1))
      add('L101', 'error', 'More than one mw:log block in the file', { line: b.openerLine });
  if (nArchive > 1)
    for (const b of archives.slice(1))
      add('L102', 'error', 'More than one mw:archive block in the file', { line: b.openerLine });

  const blockSpans = doc.blocks.map((b) => [b.openerLine, b.lastLine] as [number, number]);

  for (const b of doc.blocks) {
    if (b.form === 'unterminated')
      add('L103', 'error', `mw:${b.name} block not closed by --> on its own line`, {
        line: b.openerLine,
      });
    else if (b.openerHasTrailingJunk)
      add('L103', 'error', `mw:${b.name} opener has unexpected content after v=1`, {
        line: b.openerLine,
      });
    else if (!b.hasVersion && b.form !== 'self-closed')
      add('L103', 'error', `mw:${b.name} opener is missing the v=1 version token`, {
        line: b.openerLine,
      });

    if (b.form === 'paired-close')
      add('L104', 'error', `mw:${b.name} uses a paired </mw:${b.name}> close (it is one comment)`, {
        line: b.closeLine ?? b.openerLine,
      });

    if (b.hasVersion && b.versionRaw !== '1')
      add('L107', 'error', `Unrecognized schema version v=${b.versionRaw} (expected 1)`, {
        line: b.openerLine,
      });

    // L108: meaningful content after the block that is not another mw block.
    for (let ln = b.lastLine + 1; ln <= doc.lines.length; ln++) {
      const text = doc.lines[ln - 1]!;
      if (text.trim() === '') continue;
      if (blockSpans.some(([a, c]) => ln >= a && ln <= c)) continue;
      add('L108', 'warning', `mw:${b.name} block is not at the end of the file`, {
        line: b.openerLine,
      });
      break;
    }
  }

  // L105 / L106: stray record-shaped lines.
  for (const s of doc.strays) {
    if (s.cause === 'after-self-closed')
      add('L105', 'error', 'Record line follows a self-closed opener (use the multi-line form)', {
        line: s.line,
      });
    else add('L106', 'error', 'Record-shaped JSON sits outside any mw block (leaks in preview)', {
      line: s.line,
    });
  }
}

// ---- Tier 1: schema & values (L120-L126) ---------------------------------
function schemaAndValues(records: RecordView[], add: AddFn): void {
  for (const { line, obj, block } of records) {
    const required = block === 'log' ? LOG_REQUIRED : ARCHIVE_REQUIRED;
    for (const key of required) {
      if (!(key in obj)) {
        add('L120', 'error', `Record is missing required key "${key}"`, { line, id: str(obj.id) });
      }
    }

    const type = str(obj.type);
    if (type !== undefined && !NOTE_TYPES.includes(type as never))
      add('L121', 'error', `type "${type}" is not comment/insert/delete/replace`, {
        line,
        id: str(obj.id),
      });

    if (block === 'log') {
      const state = str(obj.state);
      if (state !== undefined && !REVIEW_STATES.includes(state as never))
        add('L122', 'error', `state "${state}" is not open/resolved`, { line, id: str(obj.id) });

      const disp = str(obj.disp);
      if (disp !== undefined && !DISPOSITIONS.includes(disp as never))
        add('L123', 'error', `disp "${disp}" is not a known disposition`, {
          line,
          id: str(obj.id),
        });

      // L124 payload rule.
      if (type !== undefined && NOTE_TYPES.includes(type as never)) {
        const hasText = 'text' in obj;
        if ((type === 'insert' || type === 'replace') && !hasText)
          add('L124', 'error', `${type} note must carry a "text" value`, { line, id: str(obj.id) });
        if ((type === 'comment' || type === 'delete') && hasText)
          add('L124', 'error', `${type} note must not carry a "text" value`, {
            line,
            id: str(obj.id),
          });
      }

      // L125 anchor shape.
      if ('anchor' in obj) checkAnchor(obj.anchor, line, str(obj.id), add);

      // L126 thread messages.
      if ('thread' in obj) checkThread(obj.thread, line, str(obj.id), add);
    }
  }
}

function checkAnchor(anchor: unknown, line: number, id: string | undefined, add: AddFn): void {
  if (!isObj(anchor)) {
    add('L125', 'error', 'anchor must be an object', { line, id });
    return;
  }
  const kind = str(anchor.kind);
  if (kind !== 'span' && kind !== 'point') {
    add('L125', 'error', `anchor.kind "${kind}" is not span/point`, { line, id });
    return;
  }
  if (kind === 'span') {
    if (str(anchor.hash) === undefined)
      add('L125', 'error', 'span anchor is missing "hash"', { line, id });
    if (str(anchor.before) === undefined)
      add('L125', 'error', 'span anchor is missing "before"', { line, id });
    if (str(anchor.after) === undefined)
      add('L125', 'error', 'span anchor is missing "after"', { line, id });
  } else {
    if ('hash' in anchor)
      add('L125', 'error', 'point anchor must not carry a "hash"', { line, id });
    if (str(anchor.before) === undefined && str(anchor.after) === undefined)
      add('L125', 'error', 'point anchor needs "before" or "after" context', { line, id });
  }
}

function checkThread(thread: unknown, line: number, id: string | undefined, add: AddFn): void {
  if (!Array.isArray(thread)) {
    add('L126', 'error', 'thread must be an array', { line, id });
    return;
  }
  for (const msg of thread) {
    if (!isObj(msg) || str(msg.by) === undefined || str(msg.at) === undefined || str(msg.body) === undefined) {
      add('L126', 'error', 'thread message must be {by, at, body}', { line, id });
      return;
    }
    const by = str(msg.by);
    if (by !== 'reviewer' && by !== 'agent') {
      add('L126', 'error', `thread message "by" is "${by}", not reviewer/agent`, { line, id });
      return;
    }
  }
}

// ---- Tier 1: escaping (L130) ---------------------------------------------
function escaping(records: RecordView[], add: AddFn): void {
  for (const { line, obj } of records) {
    const strings: string[] = [];
    collectStrings(obj, strings);
    if (strings.some((s) => s.includes('-->')))
      add('L130', 'error', 'A string value contains a raw "-->" (breaks the HTML comment)', {
        line,
        id: str(obj.id),
      });
  }
}

// ---- Tier 1: id & fence integrity (L140-L147) ----------------------------
function duplicateIds(records: RecordView[], add: AddFn): void {
  const seen = new Set<string>();
  for (const { line, obj } of records) {
    const id = str(obj.id);
    if (id === undefined) continue;
    if (seen.has(id)) add('L140', 'error', `Duplicate id "${id}"`, { line, id });
    else seen.add(id);
  }
}

interface MarkerGroup {
  starts: ParsedMarker[];
  closes: ParsedMarker[];
}

function groupMarkers(markers: ParsedMarker[]): Map<string, MarkerGroup> {
  const m = new Map<string, MarkerGroup>();
  for (const mk of markers) {
    let g = m.get(mk.id);
    if (!g) {
      g = { starts: [], closes: [] };
      m.set(mk.id, g);
    }
    (mk.isClose ? g.closes : g.starts).push(mk);
  }
  return m;
}

function fenceIntegrity(
  doc: ParsedDoc,
  logRecords: RecordView[],
  logRecordIds: Set<string>,
  archiveRecordIds: Set<string>,
  add: AddFn
): void {
  const groups = groupMarkers(doc.markers);
  const recById = new Map<string, RecordView>();
  for (const r of logRecords) {
    const id = str(r.obj.id);
    if (id) recById.set(id, r);
  }

  // L141: each log record needs a marker.
  for (const r of logRecords) {
    const id = str(r.obj.id);
    if (id && !groups.has(id))
      add('L141', 'error', `Record "${id}" has no matching inline marker`, { line: r.line, id });
  }

  // L145: markers inside fenced code.
  for (const mk of doc.markers) {
    if (mk.inCodeFence)
      add('L145', 'error', `Marker mw:${mk.id} sits inside a fenced code block`, {
        line: mk.line,
        id: mk.id,
      });
  }

  const flaggedDangling = new Set<string>();
  for (const [id, g] of groups) {
    const startCount = g.starts.length;
    const closeCount = g.closes.length;
    const rec = recById.get(id);
    const type = rec ? str(rec.obj.type) : undefined;
    const line = (g.starts[0] ?? g.closes[0])!.line;

    // L142 / L146: marker with no matching record.
    if (!logRecordIds.has(id)) {
      if (archiveRecordIds.has(id))
        add('L146', 'error', `Archived note "${id}" still has an inline marker (fences not stripped)`, {
          line,
          id,
        });
      else add('L142', 'error', `Inline marker mw:${id} has no matching record`, { line, id });
    }

    // L143: structural fence breakage.
    let dangling = false;
    if (closeCount > 0 && startCount === 0) dangling = true;
    else if (startCount > 1 || closeCount > 1) dangling = true;
    else if ((type === 'delete' || type === 'replace') && startCount === 1 && closeCount === 0)
      dangling = true;
    if (dangling) {
      flaggedDangling.add(id);
      add('L143', 'error', `Dangling fence for mw:${id} (open without close, or close without open)`, {
        line,
        id,
      });
    }

    // L144: marker shape contradicts the record type (skip if already dangling).
    if (!flaggedDangling.has(id) && type) {
      const isSpan = startCount >= 1 && closeCount >= 1;
      const isPoint = startCount >= 1 && closeCount === 0;
      if (type === 'insert' && isSpan)
        add('L144', 'error', `insert note "${id}" must be a point marker, not a span`, { line, id });
      else if ((type === 'delete' || type === 'replace') && isPoint)
        add('L144', 'error', `${type} note "${id}" must be a span (wrap the text)`, { line, id });
    }
  }

  // L147: overlapping suggested-edit spans.
  interface Span {
    id: string;
    start: number;
    end: number;
    line: number;
  }
  const spans: Span[] = [];
  for (const r of logRecords) {
    const id = str(r.obj.id);
    const type = str(r.obj.type);
    if (!id || !type || !EDIT_TYPES.has(type)) continue;
    const g = groups.get(id);
    if (!g || g.starts.length !== 1 || g.closes.length !== 1) continue;
    spans.push({ id, start: g.starts[0]!.end, end: g.closes[0]!.offset, line: g.starts[0]!.line });
  }
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (a.start < b.end && b.start < a.end)
        add('L147', 'error', `Suggested edits "${a.id}" and "${b.id}" have overlapping spans`, {
          line: Math.min(a.line, b.line),
          id: a.id,
        });
    }
  }
}

// ---- Tier 2: anchor health (L201, L202) ----------------------------------
function anchorHealth(doc: ParsedDoc, logRecords: RecordView[], add: AddFn): void {
  const groups = groupMarkers(doc.markers);
  for (const r of logRecords) {
    const id = str(r.obj.id);
    if (!id) continue;
    const anchor = r.obj.anchor;
    if (!isObj(anchor)) continue;
    const g = groups.get(id);
    if (!g) continue;
    const start = g.starts[0];
    const close = g.closes[0];
    if (!start || start.inCodeFence) continue; // L145 already covers misplaced markers

    const kind = str(anchor.kind);

    // L201: stale hash (spans only, hash present).
    if (kind === 'span' && close) {
      const storedHash = str(anchor.hash);
      if (storedHash !== undefined) {
        const wrapped = stripMarkers(doc.source.slice(start.end, close.offset));
        if (shortHash(wrapped) !== storedHash)
          add('L201', 'warning', `Stored hash for "${id}" does not match the wrapped text`, {
            line: r.line,
            id,
            fixable: true,
          });
      }
    }

    // L202: before / after context drift.
    const before = str(anchor.before);
    if (before !== undefined) {
      const window = stripMarkers(doc.source.slice(0, start.offset));
      if (!window.endsWith(before))
        add('L202', 'warning', `"before" context for "${id}" no longer matches the prose`, {
          line: r.line,
          id,
          fixable: true,
        });
    }
    const after = str(anchor.after);
    if (after !== undefined) {
      const afterAnchor = close ?? start; // span ends at close; point ends at the marker
      const window = stripMarkers(doc.source.slice(afterAnchor.end));
      if (!window.startsWith(after))
        add('L202', 'warning', `"after" context for "${id}" no longer matches the prose`, {
          line: r.line,
          id,
          fixable: true,
        });
    }
  }
}

// ---- Tier 3: lifecycle consistency (L301-L304) ---------------------------
function lifecycle(logRecords: RecordView[], archiveRecords: RecordView[], add: AddFn): void {
  for (const r of logRecords) {
    const id = str(r.obj.id);
    const state = str(r.obj.state);
    const disp = str(r.obj.disp);
    const type = str(r.obj.type);

    if (state === 'resolved')
      add('L301', 'error', `Resolved note "${id}" is still in mw:log (should be archived)`, {
        line: r.line,
        id,
      });

    if (disp === 'declined' || disp === 'needs_clarification') {
      const thread = r.obj.thread;
      const hasAgentReply =
        Array.isArray(thread) && thread.some((m) => isObj(m) && str(m.by) === 'agent');
      if (!hasAgentReply)
        add('L303', 'warning', `"${disp}" note "${id}" has no agent reply in its thread`, {
          line: r.line,
          id,
        });
    }

    if (disp === 'answered' && type && EDIT_TYPES.has(type))
      add('L304', 'warning', `disp "answered" on ${type} note "${id}" (answered means no prose change)`, {
        line: r.line,
        id,
      });
  }

  for (const r of archiveRecords) {
    const state = str(r.obj.state);
    if (state !== 'resolved')
      add('L302', 'error', `Archived note "${str(r.obj.id)}" has state "${state}", not resolved`, {
        line: r.line,
        id: str(r.obj.id),
      });
  }
}
