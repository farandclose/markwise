# M3a Create-Note (thin slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer create a brand-new `comment` note in the previewer by double-clicking a word (span) or a gap (point), written through the existing lint-gated write pipeline.

**Architecture:** Rendering changes from "splice highlight spans into the source, then render" to one markdown-it pass over the *original* source that (a) wraps each text run in an offset "breadcrumb" span carrying its exact source position, (b) converts `mw:` markers to highlight spans for open notes, and (c) drops the `mw:log`/`mw:archive` blocks. The browser reads a double-click's source offset straight off the breadcrumbs and POSTs it; the server's new pure `createNote` transform inserts the marker(s) and a complete record, then flows through the same `persist()` (fixText -> lintText -> write-if-clean) used by reply/resolve. The de-risking spike (2026-06-04) proved the offset reconstruction and the self-correct record against `sample.md`.

**Tech Stack:** TypeScript (ESM, NodeNext, `.js` import specifiers), markdown-it (server-side render), Node `http`, vanilla browser JS/CSS (no framework/bundler), vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-previewer-create-note-design.md`

---

## File Structure

- **`src/preview/render.ts`** (rewrite): replace `injectMarkerSpans` with a single-pass renderer. New internals: `annotateInlineOffsets`, custom `text` / `html_inline` / `html_block` renderer rules, `renderDocumentHtml`. Exports only `renderDocumentHtml` (drop the `injectMarkerSpans` export).
- **`src/preview/mutate.ts`** (extend): add `createNote` (returns `{ output, id }`) and a private `mintId`. Reuse `NoteMutationError`; import `shortHash`.
- **`src/preview/server.ts`** (extend): add a `POST /api/note` branch that calls `createNote` through `persist` and returns the payload plus the minted `createdId`.
- **`src/preview/assets/app.js`** (extend): double-click gesture -> selection-to-offset -> floating Comment pill -> draft card -> POST -> repaint + activate. Cmd+Option+M shortcut.
- **`src/preview/assets/app.css`** (extend): styles for `.mw-run` (transparent), the `.mw-pill`, and the draft card.
- Tests: `test/preview/render.test.ts` (rewrite), `test/preview/mutate.test.ts` (add createNote), `test/preview/server.test.ts` (add create endpoint).

---

## Task 1: Single-pass renderer with offset breadcrumbs + marker highlights

**Files:**
- Modify: `src/preview/render.ts` (full rewrite)
- Test: `test/preview/render.test.ts` (full rewrite)

- [ ] **Step 1: Rewrite the render test to the new contract**

Replace the entire contents of `test/preview/render.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { renderDocumentHtml } from '../../src/preview/render.js';

const DOC = `# Title

The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> next year.<!-- mw:s2 -->

The market is <!-- mw:s3 -->large<!-- /mw:s3 -->.

A code sample: \`<!-- mw:cf -->\`

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"00000000","before":"ships by ","after":" next"},"text":"Q4","thread":[]}
{"id":"s2","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"next year.","after":""},"text":" More.","thread":[]}
{"id":"s3","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"00000000","before":"market is ","after":"."},"thread":[]}
-->
`;

// Reverse markdown-it's escapeHtml so we can compare a breadcrumb run's text to the source slice.
function unescape(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

describe('renderDocumentHtml: breadcrumbs', () => {
  it('every text run carries a source offset that slices back to its exact text', () => {
    const html = renderDocumentHtml(DOC);
    const re = /<span class="mw-run" data-s="(\d+)" data-e="(\d+)">([^<]*)<\/span>/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(html)) !== null) {
      const s = Number(m[1]);
      const e = Number(m[2]);
      expect(DOC.slice(s, e)).toBe(unescape(m[3]!));
      count++;
    }
    expect(count).toBeGreaterThan(3); // headings + paragraphs all produce runs
  });

  it('wraps the wrapped span text "Q3" in a breadcrumb whose offset is correct', () => {
    const html = renderDocumentHtml(DOC);
    const m = /data-s="(\d+)" data-e="(\d+)">Q3<\/span>/.exec(html)!;
    expect(DOC.slice(Number(m[1]), Number(m[2]))).toBe('Q3');
  });
});

describe('renderDocumentHtml: marker highlights', () => {
  it('opens a typed highlight span for an open span note', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<span class="mw-span mw-type-replace" data-mw-id="s1">');
    expect(html).toContain('<span class="mw-span mw-type-delete" data-mw-id="s3">');
    expect(html).toContain('Q3');
  });

  it('renders an open point note as a self-closing typed span', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<span class="mw-point mw-type-insert" data-mw-id="s2"></span>');
  });

  it('drops the mw:log block and its records', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).not.toContain('mw:log');
    expect(html).not.toContain('"id":"s1"');
  });

  it('leaves a marker inside inline code untouched (not a highlight)', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).not.toContain('data-mw-id="cf"');
    expect(html).toContain('mw:cf'); // survives as literal (escaped) code text
  });

  it('does not highlight a resolved note that still has a marker', () => {
    const src = [
      '# T',
      '',
      'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
      '',
      '<!-- mw:log v=1',
      '{"id":"s1","type":"replace","state":"resolved","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}',
      '-->',
      '',
    ].join('\n');
    expect(renderDocumentHtml(src)).not.toContain('data-mw-id="s1"');
  });

  it('leaves a marker with no matching open note as a literal comment', () => {
    const src = '# T\n\nHi <!-- mw:zz -->there<!-- /mw:zz -->.\n';
    const html = renderDocumentHtml(src);
    expect(html).not.toContain('data-mw-id="zz"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/preview/render.test.ts`
Expected: FAIL (the new helpers/behavior do not exist yet; `injectMarkerSpans` import is gone but `renderDocumentHtml` still uses the old impl, so the breadcrumb assertions fail).

- [ ] **Step 3: Rewrite `src/preview/render.ts`**

Replace the entire contents of `src/preview/render.ts` with:

```ts
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { extractNotes } from './notes.js';
import type { NoteView } from './types.js';

interface RenderEnv {
  openById: Map<string, NoteView>;
}

const escapeAttr = (s: string): string => s.replace(/"/g, '&quot;');

// A single inline marker: `<!-- mw:ID -->` (start/point) or `<!-- /mw:ID -->` (close).
const MARKER_ONE = /^<!--\s*(\/?)mw:([A-Za-z0-9][A-Za-z0-9_-]*)\s*-->$/;

/** Absolute start offset of every line in `source`. */
function lineStartOffsets(source: string): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const line of source.split('\n')) {
    out.push(acc);
    acc += line.length + 1; // +1 for the '\n' split removed
  }
  return out;
}

/**
 * Annotate each inline `text` token with its absolute [s,e) source range. For each inline block we
 * anchor to the block's first source line via `token.map`, then a cursor + indexOf for each run
 * (text / code / html-comment content) steps over **bold**, [links](url), `code`, and <!-- markers
 * --> without needing to know their syntax lengths. Naive indexOf can miss runs containing
 * backslash-escapes or HTML entities (rare in prose); those runs are simply left without a
 * breadcrumb, which only means they cannot start a note - acceptable for the thin slice.
 */
function annotateInlineOffsets(tokens: Token[], source: string): void {
  const ls = lineStartOffsets(source);
  for (const t of tokens) {
    if (t.type !== 'inline' || !t.map) continue;
    const base = ls[t.map[0]]!;
    const blockEnd = ls[t.map[1]] ?? source.length;
    const slice = source.slice(base, blockEnd);
    let cursor = 0;
    for (const c of t.children ?? []) {
      let needle: string | null = null;
      if ((c.type === 'text' || c.type === 'code_inline' || c.type === 'html_inline') && c.content) {
        needle = c.content;
      }
      if (needle == null) continue;
      const at = slice.indexOf(needle, cursor);
      if (at < 0) continue;
      if (c.type === 'text') c.meta = { s: base + at, e: base + at + needle.length };
      cursor = at + needle.length;
    }
  }
}

/** Convert a single `mw:` marker comment to its highlight span. Returns null if not a marker. */
function convertMarker(raw: string, env: RenderEnv): string | null {
  const m = MARKER_ONE.exec(raw.trim());
  if (!m) return null;
  const isClose = m[1] === '/';
  const id = m[2]!;
  const note = env.openById.get(id);
  if (!note) return raw; // orphan / resolved / unknown: leave the literal comment
  if (isClose) return '</span>';
  const typeClass = `mw-type-${note.type}`;
  if (note.anchorKind === 'point') {
    return `<span class="mw-point ${typeClass}" data-mw-id="${escapeAttr(id)}"></span>`;
  }
  return `<span class="mw-span ${typeClass}" data-mw-id="${escapeAttr(id)}">`;
}

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

// Wrap every text run in an offset breadcrumb (escaped exactly like the default text rule).
md.renderer.rules.text = (tokens, idx) => {
  const t = tokens[idx]!;
  const esc = md.utils.escapeHtml(t.content);
  const meta = t.meta as { s: number; e: number } | undefined;
  return meta ? `<span class="mw-run" data-s="${meta.s}" data-e="${meta.e}">${esc}</span>` : esc;
};

// Inline marker comments become highlight spans; non-marker inline HTML passes through.
md.renderer.rules.html_inline = (tokens, idx, _opts, env) => {
  const conv = convertMarker(tokens[idx]!.content, env as RenderEnv);
  return conv ?? tokens[idx]!.content;
};

// Drop mw:log / mw:archive blocks; convert a standalone block-position marker; else pass through.
md.renderer.rules.html_block = (tokens, idx, _opts, env) => {
  const content = tokens[idx]!.content;
  if (/^\s*<!--\s*mw:(log|archive)\b/.test(content)) return '';
  const conv = convertMarker(content, env as RenderEnv);
  return conv ?? content;
};

/** Render a Markwise document to display HTML: breadcrumb runs + highlight spans for OPEN notes. */
export function renderDocumentHtml(source: string): string {
  const open = extractNotes(source).filter((n) => n.state === 'open');
  const env: RenderEnv = { openById: new Map(open.map((n) => [n.id, n])) };
  const tokens = md.parse(source, env);
  annotateInlineOffsets(tokens, source);
  return md.renderer.render(tokens, md.options, env);
}
```

- [ ] **Step 4: Run the render test to verify it passes**

Run: `npx vitest run test/preview/render.test.ts`
Expected: PASS (all breadcrumb + highlight assertions).

- [ ] **Step 5: Run the full suite to catch fallout from dropping `injectMarkerSpans`**

Run: `npx vitest run`
Expected: PASS. If `test/preview/payload.test.ts` asserted exact HTML that lacked breadcrumbs, update those assertions to match the new output (highlight spans are unchanged; text is now wrapped in `<span class="mw-run" ...>`). Do not change `payload.ts` itself.

- [ ] **Step 6: Build to confirm the type import resolves**

Run: `npm run build`
Expected: tsc succeeds (the `markdown-it/lib/token.mjs` type import resolves under NodeNext). If it does not resolve, change the import to `import type { Token } from 'markdown-it';` and use `Token` directly.

- [ ] **Step 7: Commit**

```bash
git add src/preview/render.ts test/preview/render.test.ts test/preview/payload.test.ts
git commit -m "Single-pass previewer render: offset breadcrumbs + marker highlights (M3a)"
```

---

## Task 2: `createNote` pure transform + `mintId`

**Files:**
- Modify: `src/preview/mutate.ts`
- Test: `test/preview/mutate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/preview/mutate.test.ts` (and add `createNote` to the existing import from `../../src/preview/mutate.js`):

```ts
import { createNote } from '../../src/preview/mutate.js';

const FRESH = [
  '# Demo',
  '',
  'Our wedge is teams.<!-- mw:n1 --> More text in plain text here.',
  '',
  '<!-- mw:log v=1',
  '{"id":"n1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"teams.","after":" More t"},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"hi"}]}',
  '-->',
  '',
].join('\n');

describe('createNote', () => {
  const at = '2026-06-04T00:00:00Z';

  it('wraps a word as a span comment with a correct anchor', () => {
    const wStart = FRESH.indexOf('wedge');
    const { output, id } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: 'why?', at });
    expect(id).toBe('n2'); // n1 taken
    expect(output).toContain(`<!-- mw:n2 -->wedge<!-- /mw:n2 -->`);
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith('{"id":"n2"'))!);
    expect(rec.type).toBe('comment');
    expect(rec.state).toBe('open');
    expect(rec.anchor.kind).toBe('span');
    expect(typeof rec.anchor.hash).toBe('string');
    expect(rec.anchor.before.endsWith('Our ')).toBe(true);
    expect(rec.anchor.after.startsWith(' is ')).toBe(true);
    expect(rec.thread).toEqual([{ by: 'reviewer', at, body: 'why?' }]);
  });

  it('inserts a point comment (no hash) at a gap', () => {
    const gap = FRESH.indexOf('plain text') + 'plain'.length; // between "plain" and "text"
    const { output, id } = createNote(FRESH, { kind: 'point', start: gap, body: 'add a unit', at });
    expect(output).toContain(`plain<!-- mw:${id} -->`);
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.anchor.kind).toBe('point');
    expect(rec.anchor.hash).toBeUndefined();
  });

  it('the created record is self-correct: fixText changes nothing and it lints clean', async () => {
    const { fixText } = await import('../../src/fix.js');
    const { lintText } = await import('../../src/lint.js');
    const wStart = FRESH.indexOf('wedge');
    const { output } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: 'why?', at });
    expect(fixText(output).changes).toEqual([]);
    expect(lintText(output).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('mints the smallest unused nN across log and archive', () => {
    const withArchive = FRESH.replace(
      '-->\n',
      '-->\n\n<!-- mw:archive v=1\n{"id":"n2","type":"comment","state":"resolved","at":"x","summary":"s"}\n-->\n'
    );
    const wStart = withArchive.indexOf('wedge');
    const { id } = createNote(withArchive, { kind: 'span', start: wStart, end: wStart + 5, body: 'q', at });
    expect(id).toBe('n3'); // n1 (log) and n2 (archive) both taken
  });

  it('creates the mw:log block when the document has none', () => {
    const noLog = '# Demo\n\nOur wedge is here.\n';
    const wStart = noLog.indexOf('wedge');
    const { output, id } = createNote(noLog, { kind: 'span', start: wStart, end: wStart + 5, body: 'q', at });
    expect(id).toBe('n1');
    expect(output).toContain('<!-- mw:log v=1');
    expect(output).toContain(`<!-- mw:n1 -->wedge<!-- /mw:n1 -->`);
  });

  it('rejects an empty body and an out-of-range selection', () => {
    expect(() => createNote(FRESH, { kind: 'point', start: 5, body: '   ', at })).toThrow(NoteMutationError);
    expect(() => createNote(FRESH, { kind: 'point', start: 10_000, body: 'x', at })).toThrow(NoteMutationError);
    expect(() => createNote(FRESH, { kind: 'span', start: 5, end: 5, body: 'x', at })).toThrow(NoteMutationError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: FAIL with "createNote is not a function" (or an import error).

- [ ] **Step 3: Implement `createNote` and `mintId` in `src/preview/mutate.ts`**

Add this import at the top (next to the existing imports):

```ts
import { shortHash } from '../hash.js';
```

Add at the end of `src/preview/mutate.ts`:

```ts
const MARKER_RE = /<!--\s*\/?mw:[A-Za-z0-9][A-Za-z0-9_-]*\s*-->/g;
const stripMarkers = (s: string): string => s.replace(MARKER_RE, '');
const CONTEXT_WINDOW = 16; // chars of before/after context stored on a new anchor

/** Smallest unused id of the form `nN`, scanning record ids across every block (log + archive). */
function mintId(source: string): string {
  const used = new Set<string>();
  for (const b of parse(source).blocks) {
    for (const r of b.records) {
      if (isObj(r.json) && typeof r.json.id === 'string') used.add(r.json.id);
    }
  }
  let n = 1;
  while (used.has(`n${n}`)) n++;
  return `n${n}`;
}

/** Insert `recordJson` as the first record line of the mw:log block, creating the block if absent. */
function insertLogRecord(source: string, recordJson: string): string {
  const doc = parse(source);
  const log = doc.blocks.find((b) => b.name === 'log');
  const lines = source.split('\n');
  if (log) {
    lines.splice(log.openerLine, 0, recordJson); // right after the opener line (1-based -> this index)
    return lines.join('\n');
  }
  // No log block: create one at the end of the file.
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop();
  out.push('', '<!-- mw:log v=1', recordJson, '-->');
  return out.join('\n');
}

/**
 * Create a brand-new reviewer `comment` note. Inserts the marker(s) into the prose and a COMPLETE
 * record (before/after context + span hash computed directly from the source) into mw:log, then
 * returns the new text and the minted id. The record is built correct so the persist pipeline's
 * fixText/lintText are a pure safety net. Pure transform; `at` is the caller-supplied ISO time.
 */
export function createNote(
  source: string,
  opts: { kind: 'point' | 'span'; start: number; end?: number; body: string; at: string }
): { output: string; id: string } {
  const body = opts.body.trim();
  if (body === '') throw new NoteMutationError('comment body is empty', 400);
  const { kind, start } = opts;
  if (!Number.isInteger(start) || start < 0 || start > source.length) {
    throw new NoteMutationError('selection start out of range', 400);
  }
  const id = mintId(source);
  const before = stripMarkers(source.slice(0, start)).slice(-CONTEXT_WINDOW);
  const open = `<!-- mw:${id} -->`;

  let withMarkers: string;
  let anchor: Record<string, unknown>;
  if (kind === 'span') {
    const end = opts.end;
    if (!Number.isInteger(end) || end! <= start || end! > source.length) {
      throw new NoteMutationError('selection end out of range', 400);
    }
    const wrapped = source.slice(start, end!);
    const after = stripMarkers(source.slice(end!)).slice(0, CONTEXT_WINDOW);
    const close = `<!-- /mw:${id} -->`;
    withMarkers = source.slice(0, start) + open + wrapped + close + source.slice(end!);
    anchor = { kind: 'span', hash: shortHash(stripMarkers(wrapped)), before, after };
  } else {
    const after = stripMarkers(source.slice(start)).slice(0, CONTEXT_WINDOW);
    withMarkers = source.slice(0, start) + open + source.slice(start);
    anchor = { kind: 'point', before, after };
  }

  const record = {
    id,
    type: 'comment',
    state: 'open',
    disp: 'none',
    anchor,
    thread: [{ by: 'reviewer', at: opts.at, body }],
  };
  return { output: insertLogRecord(withMarkers, JSON.stringify(record)), id };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: PASS (all createNote cases).

- [ ] **Step 5: Commit**

```bash
git add src/preview/mutate.ts test/preview/mutate.test.ts
git commit -m "Add createNote transform + mintId (M3a)"
```

---

## Task 3: `POST /api/note` create endpoint

**Files:**
- Modify: `src/preview/server.ts`
- Test: `test/preview/server.test.ts`

- [ ] **Step 1: Write the failing endpoint tests**

Append inside the existing `describe('createPreviewServer', ...)` block in `test/preview/server.test.ts`:

```ts
  it('creates a span comment from a selection and returns the new id', async () => {
    const base = await start(DOC);
    const wStart = DOC.indexOf('Ships'); // wrap "Ships"
    const res = await post(base, '/api/note', { kind: 'span', start: wStart, end: wStart + 5, body: 'fix this' });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.createdId).toBe('n1'); // mintId always mints nN; DOC's only id is "s1"
    expect(payload.openCount).toBe(2);
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).toContain('<!-- mw:n1 -->Ships<!-- /mw:n1 -->');
  });

  it('creates a point comment at a gap', async () => {
    const base = await start(DOC);
    const gap = DOC.indexOf('by'); // a clean inter-word gap, not inside the s1 span
    const res = await post(base, '/api/note', { kind: 'point', start: gap, body: 'here' });
    expect(res.status).toBe(200);
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(/"kind":"point"/.test(onDisk)).toBe(true);
  });

  it('rejects a zero-width span selection (400) and leaves the file byte-identical', async () => {
    const base = await start(DOC);
    const original = readFileSync(join(dir!, 'demo.md'), 'utf8');
    const res = await post(base, '/api/note', { kind: 'span', start: 5, end: 5, body: 'x' });
    expect(res.status).toBe(400);
    expect(readFileSync(join(dir!, 'demo.md'), 'utf8')).toBe(original);
    // The 422 lint-gate itself is shared persist() behavior, already covered by the reply/resolve tests.
  });

  it('rejects an empty body', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { kind: 'point', start: 3, body: '  ' });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/preview/server.test.ts`
Expected: FAIL (the `/api/note` route 404s today, so `res.status` is 404 not 200/400).

- [ ] **Step 3: Add the create branch to `src/preview/server.ts`**

In the import on line 9, add `createNote`:

```ts
import { appendReply, resolveNote, createNote, NoteMutationError } from './mutate.js';
```

Insert this branch immediately AFTER the existing `mutateRoute` block (after its closing `return;` on line 101, before the `GET /api/doc` block):

```ts
      if (req.method === 'POST' && url.pathname === '/api/note') {
        try {
          const parsed = await readJsonBody(req);
          const kind = isObj(parsed) && parsed.kind === 'point' ? 'point' : 'span';
          const start = isObj(parsed) && typeof parsed.start === 'number' ? parsed.start : NaN;
          const end = isObj(parsed) && typeof parsed.end === 'number' ? parsed.end : undefined;
          const body = isObj(parsed) && typeof parsed.body === 'string' ? parsed.body : '';
          const now = new Date().toISOString();
          let createdId = '';
          const payload = persist(filePath, (src) => {
            const r = createNote(src, { kind, start, end, body, at: now });
            createdId = r.id;
            return r.output;
          });
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ...payload, createdId }));
        } catch (err) {
          const status = err instanceof NoteMutationError ? err.status : 500;
          const message = err instanceof Error ? err.message : 'error';
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: message }));
        }
        return;
      }
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/preview/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: PASS and clean build.

- [ ] **Step 6: Commit**

```bash
git add src/preview/server.ts test/preview/server.test.ts
git commit -m "Add POST /api/note create endpoint through persist (M3a)"
```

---

## Task 4: Browser - double-click gesture, selection-to-offset, Comment pill

**Files:**
- Modify: `src/preview/assets/app.js`
- Modify: `src/preview/assets/app.css`

This task and Task 5 are vanilla browser JS (no unit harness, per the spec's acknowledged gap). Each ends with a concrete manual verification on the gitignored `playground.md`.

- [ ] **Step 1: Add CSS for breadcrumbs and the Comment pill**

Append to `src/preview/assets/app.css`:

```css
/* Offset breadcrumbs are invisible structure - never alter the reading surface (M3a) */
.mw-run { background: none; }

/* Floating Comment pill on a selection (spec section 8) */
.mw-pill {
  position: absolute;
  z-index: 20;
  transform: translate(-50%, -100%);
  background: #111;
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.mw-pill::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #111;
}
```

- [ ] **Step 2: Add gesture + pill logic to `src/preview/assets/app.js`**

Inside the IIFE, after the `let activeId = null;` line, add:

```js
  let pendingTarget = null; // { kind:'span'|'point', start, end? } awaiting a draft
  let pillEl = null;
```

Add these helpers just above the `wireProseActivation` function:

```js
  function clearPill() {
    if (pillEl) { pillEl.remove(); pillEl = null; }
  }

  // Map a DOM (textNode, offset) to an absolute source offset via the enclosing breadcrumb run.
  function srcOffset(container, offset) {
    var el = container && container.nodeType === 3 ? container.parentElement : container;
    var run = el && el.closest ? el.closest('.mw-run') : null;
    if (!run) return null;
    return parseInt(run.getAttribute('data-s'), 10) + offset;
  }

  // Read the current double-click result into a creation target, or null if unusable.
  function targetFromEvent(e) {
    var sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      var r = sel.getRangeAt(0);
      var s = srcOffset(r.startContainer, r.startOffset);
      var en = srcOffset(r.endContainer, r.endOffset);
      if (s != null && en != null && en > s) {
        return { kind: 'span', start: s, end: en, rect: r.getBoundingClientRect() };
      }
      return null;
    }
    // Collapsed: double-click on a gap -> a point at the caret.
    var pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (pos) {
      var off = srcOffset(pos.startContainer, pos.startOffset);
      if (off != null) {
        return { kind: 'point', start: off, rect: { left: e.clientX, top: e.clientY, width: 0 } };
      }
    }
    return null;
  }

  function showPill(target) {
    clearPill();
    pendingTarget = target;
    pillEl = document.createElement('button');
    pillEl.type = 'button';
    pillEl.className = 'mw-pill';
    pillEl.textContent = '💬 Comment';
    var rect = target.rect;
    pillEl.style.left = window.scrollX + rect.left + rect.width / 2 + 'px';
    pillEl.style.top = window.scrollY + rect.top - 8 + 'px';
    pillEl.addEventListener('click', function (e) {
      e.stopPropagation();
      openDraft(pendingTarget); // defined in Task 5
    });
    body.appendChild(pillEl);
  }
```

Add the double-click and keyboard wiring at the bottom of the IIFE, just before `wireProseActivation();`:

```js
  docEl.addEventListener('dblclick', function (e) {
    var target = targetFromEvent(e);
    if (target) showPill(target);
  });

  // Cmd+Option+M / Ctrl+Alt+M opens a draft from the current selection (spec section 8).
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === 'm' || e.key === 'M')) {
      var sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        var r = sel.getRangeAt(0);
        var s = srcOffset(r.startContainer, r.startOffset);
        var en = srcOffset(r.endContainer, r.endOffset);
        if (s != null && en != null && en > s) {
          e.preventDefault();
          openDraft({ kind: 'span', start: s, end: en }); // defined in Task 5
        }
      }
    }
  });

  // Clicking elsewhere dismisses a pending pill.
  document.addEventListener('mousedown', function (e) {
    if (pillEl && e.target !== pillEl) clearPill();
  });
```

- [ ] **Step 3: Build, then manually verify the pill appears**

Run: `npm run build`
Then run: `node ./dist/cli.js preview playground.md` and open the printed localhost URL.
Expected: toggle notes on; double-click a word -> a "Comment" pill appears above it; double-click a gap between two words -> a pill appears; click elsewhere -> pill disappears. (`openDraft` is not defined until Task 5, so clicking the pill will error in the console - that is expected at this checkpoint.)

- [ ] **Step 4: Commit**

```bash
git add src/preview/assets/app.js src/preview/assets/app.css
git commit -m "Browser: double-click gesture + Comment pill (M3a)"
```

---

## Task 5: Browser - draft card, Add/Cancel, create + repaint + activate

**Files:**
- Modify: `src/preview/assets/app.js`
- Modify: `src/preview/assets/app.css`

- [ ] **Step 1: Add draft-card CSS**

Append to `src/preview/assets/app.css`:

```css
/* Draft note card (composition, spec section 8) */
.mw-draft {
  border: 1px dashed var(--mw-ink);
  border-radius: 10px;
  background: #fff;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.mw-draft textarea {
  width: 100%;
  min-height: 56px;
  border: 1px solid var(--mw-line);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  font-size: 14px;
  resize: vertical;
}
.mw-draft-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.mw-draft-actions button { border: 1px solid var(--mw-line); background: #fff; border-radius: 8px; padding: 5px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.mw-draft-add { border-color: var(--mw-ink); }
```

- [ ] **Step 2: Add `openDraft` to `src/preview/assets/app.js`**

Add this function just above the `load()` function:

```js
  function openDraft(target) {
    clearPill();
    if (body.classList.contains('mw-clean')) reveal(true);
    // Remove any existing draft first (one draft at a time).
    var existing = railEl.querySelector('.mw-draft');
    if (existing) existing.remove();

    var card = document.createElement('section');
    card.className = 'mw-draft';
    var ta = document.createElement('textarea');
    ta.placeholder = 'Write a comment…';
    var actions = document.createElement('div');
    actions.className = 'mw-draft-actions';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mw-draft-cancel';
    cancel.textContent = 'Cancel';
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'mw-draft-add';
    add.textContent = 'Add';

    cancel.addEventListener('click', function () {
      card.remove();
      var s = window.getSelection();
      if (s) s.removeAllRanges();
    });
    add.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) return;
      add.disabled = true;
      var payload = { kind: target.kind, start: target.start, body: text };
      if (target.kind === 'span') payload.end = target.end;
      fetch('/api/note', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Create failed'); });
          return r.json();
        })
        .then(function (data) {
          if (data && data.createdId) activeId = data.createdId; // activate the new note after repaint
          return load();
        })
        .catch(function (err) { showToast(err.message || 'Create failed'); add.disabled = false; });
    });

    actions.appendChild(cancel);
    actions.appendChild(add);
    card.appendChild(ta);
    card.appendChild(actions);
    railEl.insertBefore(card, railEl.firstChild);
    ta.focus();
  }
```

- [ ] **Step 3: Build, then manually verify the full create flow**

Run: `npm run build`
Then run: `node ./dist/cli.js preview playground.md` and open the URL.
Expected:
  - Double-click a word -> Comment pill -> click it -> a dashed draft card appears at the top of the rail with focus in the textarea.
  - Type a comment, click **Add** -> the document repaints, the word is now highlighted, the new note's card is active in the rail, and the notes counter increments by one.
  - Re-open `playground.md` in an editor: the new `mw:n*` markers wrap the word and a `comment` record with a `reviewer` thread message is in `mw:log`.
  - Double-click a gap -> pill -> Add -> a point note is created.
  - Draft **Cancel** writes nothing.
  - Run `node ./dist/cli.js lint playground.md` -> clean (no errors).

- [ ] **Step 4: Reset the playground after dogfooding**

Run: `cp sample.md playground.md` (so the scratch file returns to the clean reference; it is gitignored and never committed).

- [ ] **Step 5: Commit**

```bash
git add src/preview/assets/app.js src/preview/assets/app.css
git commit -m "Browser: draft card -> create note -> repaint + activate (M3a)"
```

---

## Final verification

- [ ] **Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: all tests pass, build clean.

- [ ] **Confirm `sample.md` still lints clean (the committed reference is untouched)**

Run: `node ./dist/cli.js lint sample.md`
Expected: clean.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** gesture model (Tasks 4-5), breadcrumb foundation (Task 1), composition pill + draft + Cmd+Option+M (Tasks 4-5), server create + createNote through persist (Tasks 2-3), the `comment`/id-minting record (Task 2), safety/lint-gate (inherited via `persist`, exercised in Task 3), testing (Tasks 1-3 unit/integration; Tasks 4-5 manual per the acknowledged gap).
- **Acknowledged gaps from the spec, intentionally not closed here:** drag-select phrases, the 3/4-click sentence/paragraph rungs, discard, archive browse, and the "Done reviewing" handoff. Backslash-escape / HTML-entity text runs may lack a breadcrumb (cannot start a note there) - acceptable for the thin slice.
- **Type consistency:** `createNote` returns `{ output, id }` (Task 2) and the server adapts it via a closure (Task 3). The request shape `{ kind, start, end?, body }` matches between client (Task 5), server validation (Task 3), and `createNote` (Task 2).
