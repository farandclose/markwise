// The Markwise parser. Turns raw file text into a structured, *descriptive* model that the lint
// rules read from. It does not reject malformed input - it classifies it, so each rule can map a
// shape to a finding (LINT_SPEC.md). Locators here are 1-based line numbers.

export type BlockName = 'log' | 'archive';

export type BlockForm =
  | 'multiline' // proper: opener line, record lines, then `-->` on its own line (D33)
  | 'self-closed' // `<!-- mw:log v=1 -->` all on one line (D33c) -> L105 if records follow
  | 'paired-close' // closed by `<!-- /mw:log -->` (D33b) -> L104
  | 'unterminated'; // no closing `-->` found -> L103

export interface RawRecordLine {
  line: number;
  raw: string;
  json: unknown | null;
  jsonError?: string;
}

export interface ParsedBlock {
  name: BlockName;
  openerLine: number;
  closeLine: number | null;
  lastLine: number; // last 1-based line this block occupies (close line, or last content if unterminated)
  form: BlockForm;
  hasVersion: boolean;
  versionRaw: string | null; // the token after `v=`, e.g. "1"
  openerHasTrailingJunk: boolean; // non-whitespace after the version token (excluding a `-->`)
  records: RawRecordLine[];
}

export interface ParsedMarker {
  id: string;
  line: number;
  /** 0-based absolute offset of the marker's first char in `source`. */
  offset: number;
  /** 0-based absolute offset just past the marker's last char. */
  end: number;
  isClose: boolean; // true for `<!-- /mw:id -->`
  inCodeFence: boolean;
  raw: string;
}

export interface StrayRecord {
  line: number;
  raw: string;
  cause: 'no-block' | 'after-self-closed'; // -> L106 or L105
}

export interface ParsedDoc {
  source: string;
  lines: string[];
  blocks: ParsedBlock[];
  markers: ParsedMarker[];
  strays: StrayRecord[];
  /** Inclusive 1-based line ranges of fenced code blocks. */
  codeFences: Array<[number, number]>;
}

const OPENER_RE = /^\s*<!--\s*mw:(log|archive)\b(.*)$/;
const PAIRED_CLOSE_RE = /^\s*<!--\s*\/mw:(log|archive)\s*-->\s*$/;
const CLOSE_LINE_RE = /^\s*-->\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
// Inline markers. `mw:ID` where ID is not a reserved block name. Start/point vs close.
const MARKER_RE = /<!--\s*(\/?)mw:([A-Za-z0-9][A-Za-z0-9_-]*)\s*-->/g;

function looksLikeRecord(line: string): { ok: boolean; json: unknown | null; err?: string } {
  const t = line.trim();
  if (!t.startsWith('{')) return { ok: false, json: null };
  try {
    const json = JSON.parse(t);
    if (json && typeof json === 'object' && !Array.isArray(json)) return { ok: true, json };
    return { ok: false, json: null };
  } catch (e) {
    // Looks like a record (starts with `{`) but is not valid JSON. Still "record-shaped".
    return { ok: true, json: null, err: (e as Error).message };
  }
}

function computeCodeFences(lines: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let open: number | null = null;
  let marker = '';
  lines.forEach((line, i) => {
    const m = FENCE_RE.exec(line);
    if (!m) return;
    const fence = m[1]!;
    if (open === null) {
      open = i + 1;
      marker = fence;
    } else if (fence === marker) {
      ranges.push([open, i + 1]);
      open = null;
      marker = '';
    }
  });
  if (open !== null) ranges.push([open, lines.length]); // unterminated fence runs to EOF
  return ranges;
}

function inAnyRange(line: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([a, b]) => line >= a && line <= b);
}

function parseOpenerRest(rest: string): {
  hasVersion: boolean;
  versionRaw: string | null;
  selfClosed: boolean;
  trailingJunk: boolean;
} {
  const selfClosed = /-->/.test(rest);
  const body = rest.replace(/-->/, '').trim();
  const vm = /\bv\s*=\s*(\S+)/.exec(body);
  const hasVersion = vm !== null;
  const versionRaw = vm ? vm[1]! : null;
  // Anything left over after removing the version token is junk.
  const leftover = hasVersion ? body.replace(vm![0], '').trim() : body;
  const trailingJunk = leftover.length > 0;
  return { hasVersion, versionRaw, selfClosed, trailingJunk };
}

export function parse(source: string): ParsedDoc {
  const lines = source.split('\n');
  const codeFences = computeCodeFences(lines);
  const blocks: ParsedBlock[] = [];
  const strays: StrayRecord[] = [];
  // Track which lines are consumed by a block so the stray scan can skip them.
  const consumed = new Set<number>();

  let i = 0;
  while (i < lines.length) {
    const lineNo = i + 1;
    const raw = lines[i]!;

    // Do not treat block openers inside code fences as real blocks.
    const opener = inAnyRange(lineNo, codeFences) ? null : OPENER_RE.exec(raw);
    if (!opener) {
      i++;
      continue;
    }

    const name = opener[1] as BlockName;
    const rest = opener[2] ?? '';
    const { hasVersion, versionRaw, selfClosed, trailingJunk } = parseOpenerRest(rest);
    consumed.add(lineNo);

    if (selfClosed) {
      // `<!-- mw:log v=1 -->` on one line (D33c). Collect any record-shaped lines that follow
      // as strays attributed to L105.
      let j = i + 1;
      let lastStray = lineNo;
      while (j < lines.length) {
        const t = lines[j]!.trim();
        if (t === '') {
          j++;
          continue;
        }
        const rec = looksLikeRecord(lines[j]!);
        if (!rec.ok) break;
        strays.push({ line: j + 1, raw: lines[j]!, cause: 'after-self-closed' });
        consumed.add(j + 1);
        lastStray = j + 1;
        j++;
      }
      blocks.push({
        name,
        openerLine: lineNo,
        closeLine: lineNo,
        lastLine: lastStray,
        form: 'self-closed',
        hasVersion,
        versionRaw,
        openerHasTrailingJunk: trailingJunk,
        records: [],
      });
      i = j;
      continue;
    }

    // Multiline form: collect record lines until a closing `-->`, a paired close, or EOF.
    const records: RawRecordLine[] = [];
    let form: BlockForm = 'unterminated';
    let closeLine: number | null = null;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const cur = lines[j]!;
      if (CLOSE_LINE_RE.test(cur)) {
        form = 'multiline';
        closeLine = j + 1;
        consumed.add(j + 1);
        break;
      }
      if (PAIRED_CLOSE_RE.test(cur)) {
        form = 'paired-close';
        closeLine = j + 1;
        consumed.add(j + 1);
        break;
      }
      if (OPENER_RE.test(cur) && !inAnyRange(j + 1, codeFences)) {
        // A new block opener with no close for this one: this block is unterminated.
        break;
      }
      // A record line (may be blank; skip blanks from the record set but still consume).
      consumed.add(j + 1);
      if (cur.trim() === '') continue;
      const rec = looksLikeRecord(cur);
      records.push({ line: j + 1, raw: cur, json: rec.json, jsonError: rec.err });
    }

    const lastContentLine = records.length > 0 ? records[records.length - 1]!.line : lineNo;
    blocks.push({
      name,
      openerLine: lineNo,
      closeLine,
      lastLine: closeLine ?? lastContentLine,
      form,
      hasVersion,
      versionRaw,
      openerHasTrailingJunk: trailingJunk,
      records,
    });
    i = form === 'unterminated' ? j : j + 1;
  }

  // Precompute the absolute start offset of each line in `source`.
  const lineStartOffsets: number[] = [];
  {
    let acc = 0;
    for (const line of lines) {
      lineStartOffsets.push(acc);
      acc += line.length + 1; // +1 for the '\n' we split on
    }
  }

  // Inline markers across the whole file, excluding those inside any block's line span.
  const markers: ParsedMarker[] = [];
  const blockSpans = blocks.map(
    (b) => [b.openerLine, b.lastLine] as [number, number]
  );
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (inAnyRange(lineNo, blockSpans)) return;
    MARKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARKER_RE.exec(line)) !== null) {
      const id = m[2]!;
      if (id === 'log' || id === 'archive') continue;
      const offset = lineStartOffsets[idx]! + m.index;
      markers.push({
        id,
        line: lineNo,
        offset,
        end: offset + m[0].length,
        isClose: m[1] === '/',
        inCodeFence: inAnyRange(lineNo, codeFences),
        raw: m[0],
      });
    }
  });

  // Stray record-shaped lines that are not inside any block (L106).
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (consumed.has(lineNo)) return;
    if (inAnyRange(lineNo, codeFences)) return;
    const rec = looksLikeRecord(line);
    if (rec.ok && rec.json && typeof rec.json === 'object' && 'id' in (rec.json as object)) {
      strays.push({ line: lineNo, raw: line, cause: 'no-block' });
    }
  });

  return { source, lines, blocks, markers, strays, codeFences };
}
