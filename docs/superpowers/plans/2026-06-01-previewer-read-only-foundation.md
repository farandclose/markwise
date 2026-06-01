# Previewer - Read-Only Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `markwise preview <file>` - a terminal-launched local web view that renders a Markwise document as a clean read, reveals existing notes as in-prose highlights plus a right-hand rail, and lets the reviewer activate one note at a time. Read-only: no note creation, reply, resolve, or handoff yet (that is Milestone 2).

**Architecture:** A small Node `http` server (no framework) reads the `.md` file on every request and returns a JSON payload: the document rendered to HTML (with `mw:` markers turned into highlight `<span>`s) plus the open notes as a view-model. The browser side is a single static, dependency-free `app.js` that injects the HTML into a centered reading column, builds the notes rail, and wires the clean<->revealed toggle and bidirectional note activation. All Markwise/markdown logic stays server-side and pure (testable with vitest in Node); the browser is a thin renderer. This deliberately avoids a frontend bundler and the Web Crypto hashing swap - both are unnecessary until a serverless build, and neither is needed to render.

**Tech Stack:** TypeScript (ESM, `NodeNext`), Node `http`/`fs` (built-ins), `markdown-it` (new runtime dependency, server-side rendering only), vitest. Vanilla browser JS/CSS served as static assets. No bundler, no browser framework.

**Why this milestone is read-only:** Rendering existing markers as highlights is the *easy* direction (marker -> span). Creating notes is the *hard* direction (a rendered-DOM selection must map back to a source offset to place a marker) and is isolated entirely into Milestone 2 so it gets focused treatment. The spec sections covered here are: section 1 opening state, section 2 toolbar, section 3 counter/toggle, section 4 note rendering, section 5 rail + activation, section 13 reuse-the-core. The interaction/mutation sections (section 6 verbs, section 7 ladder, section 8 composition, section 9 resolve, section 10 discard, section 11 handoff) are Milestone 2.

**Spec:** `docs/superpowers/specs/2026-06-01-previewer-ui-design.md`

---

## File Structure

New files (all under `src/preview/` except the library entry point):

- `src/index.ts` - **library entry point.** Re-exports `parse`, `lintText`, `fixText`, `stripText`, `status`, and the domain types so a second consumer has one import surface (spec section 13). Trivial; establishes the boundary now.
- `src/preview/types.ts` - `NoteView` (the rail/render view-model) and `DocPayload` (the `/api/doc` JSON shape).
- `src/preview/notes.ts` - `extractNotes(source): NoteView[]` - reads `mw:log` records into view-models, sorted in **document order** (by first marker offset).
- `src/preview/render.ts` - `injectMarkerSpans(source, notes): string` (markers -> spans, blocks stripped) and `renderDocumentHtml(source): string` (markdown-it render of the injected body).
- `src/preview/payload.ts` - `buildDocPayload(source, filePath): DocPayload` - the pure assembler the server returns as JSON.
- `src/preview/server.ts` - `createPreviewServer(filePath): http.Server` - routes `/api/doc` + static assets.
- `src/preview/assets/index.html` - app shell (toolbar, reading column, rail).
- `src/preview/assets/app.css` - clean reading styles + note treatments + active shading.
- `src/preview/assets/app.js` - vanilla browser app (fetch, render, toggle, rail, activation).
- `scripts/copy-preview-assets.mjs` - build step that copies `src/preview/assets/` into `dist/preview/assets/` (tsc only emits `.js` from `.ts`, so the static assets need copying to ship).

Modified files:

- `src/cli.ts` - add the `preview` command (long-running; does not `process.exit`).
- `package.json` - add `markdown-it` dep, `@types/markdown-it` dev-dep, extend `build` to copy assets.

New test files:

- `test/preview/notes.test.ts`, `test/preview/render.test.ts`, `test/preview/payload.test.ts`, `test/preview/server.test.ts`.

A reusable fixture string (a small doc with one span comment, one point insert, one span delete, and a `mw:log` block) is defined inline in each test that needs it - repeated rather than shared so tasks can be implemented out of order.

---

## Task 1: Add markdown-it and the library entry point

**Files:**
- Modify: `package.json`
- Create: `src/index.ts`
- Test: `test/preview/entry.test.ts`

- [ ] **Step 1: Install markdown-it**

Run:
```bash
pnpm add markdown-it@^14.1.0
pnpm add -D @types/markdown-it@^14.1.2
```
Expected: `package.json` gains `markdown-it` under `dependencies` and `@types/markdown-it` under `devDependencies`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Write the failing test**

Create `test/preview/entry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as mw from '../../src/index.js';

describe('library entry point', () => {
  it('re-exports the core functions', () => {
    expect(typeof mw.parse).toBe('function');
    expect(typeof mw.lintText).toBe('function');
    expect(typeof mw.fixText).toBe('function');
    expect(typeof mw.stripText).toBe('function');
    expect(typeof mw.status).toBe('function');
  });

  it('parse returns a ParsedDoc shape', () => {
    const doc = mw.parse('hello\n');
    expect(Array.isArray(doc.blocks)).toBe(true);
    expect(Array.isArray(doc.markers)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run test/preview/entry.test.ts`
Expected: FAIL - `Cannot find module '../../src/index.js'`.

- [ ] **Step 4: Write the entry point**

Create `src/index.ts`:
```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run test/preview/entry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the whole build still type-checks**

Run: `pnpm build`
Expected: exit 0, no tsc errors. `dist/index.js` and `dist/index.d.ts` are emitted.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/index.ts test/preview/entry.test.ts
git commit -m "feat(preview): add markdown-it and library entry point"
```

---

## Task 2: The note view-model - `extractNotes`

**Files:**
- Create: `src/preview/types.ts`
- Create: `src/preview/notes.ts`
- Test: `test/preview/notes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/preview/notes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractNotes } from '../../src/preview/notes.js';

const DOC = `The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> next year.<!-- mw:s2 -->

The market is <!-- mw:s3 -->large and growing<!-- /mw:s3 -->.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"9fc58f1a","before":"ships by ","after":" next"},"text":"Q4","thread":[{"by":"reviewer","at":"2026-05-24T14:00","body":"Use Q4."}]}
{"id":"s2","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"next year."},"text":" We expect strong demand.","thread":[]}
{"id":"s3","type":"delete","state":"resolved","disp":"applied","anchor":{"kind":"span","hash":"d55f3029","before":"market is ","after":"."},"thread":[{"by":"reviewer","at":"2026-05-24T14:01","body":"Cut it."}]}
-->
`;

describe('extractNotes', () => {
  it('returns one NoteView per log record', () => {
    const notes = extractNotes(DOC);
    expect(notes.map((n) => n.id)).toEqual(['s1', 's2', 's3']);
  });

  it('carries type, anchorKind, state, disp, text, and thread', () => {
    const [s1, s2] = extractNotes(DOC);
    expect(s1).toMatchObject({ id: 's1', type: 'replace', anchorKind: 'span', state: 'open', disp: 'none', text: 'Q4' });
    expect(s1.thread).toHaveLength(1);
    expect(s1.thread[0]).toMatchObject({ by: 'reviewer', body: 'Use Q4.' });
    expect(s2).toMatchObject({ id: 's2', type: 'insert', anchorKind: 'point' });
    expect(s2.text).toBe(' We expect strong demand.');
    expect(s2.thread).toEqual([]);
  });

  it('orders notes by their first marker offset (document order), not log order', () => {
    // Reverse the log lines; the rail order should still follow the prose markers.
    const reordered = DOC.replace(
      /(<!-- mw:log v=1\n)([\s\S]*?)(\n-->)/,
      (_m, open, body, close) => open + body.split('\n').reverse().join('\n') + close,
    );
    const ids = extractNotes(reordered).map((n) => n.id);
    expect(ids).toEqual(['s1', 's2', 's3']);
  });

  it('skips records that are not valid objects', () => {
    const broken = DOC.replace('{"id":"s2"', 'not-json {"id":"s2"');
    const ids = extractNotes(broken).map((n) => n.id);
    expect(ids).toEqual(['s1', 's3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/preview/notes.test.ts`
Expected: FAIL - `Cannot find module '../../src/preview/notes.js'`.

- [ ] **Step 3: Write the view-model types**

Create `src/preview/types.ts`:
```ts
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
```

- [ ] **Step 4: Write `extractNotes`**

Create `src/preview/notes.ts`:
```ts
import { parse } from '../parse.js';
import type { NoteType, ReviewState, Disposition, AnchorKind, ThreadMessage } from '../types.js';
import type { NoteView } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const NOTE_TYPES: readonly string[] = ['comment', 'insert', 'delete', 'replace'];
const STATES: readonly string[] = ['open', 'resolved'];
const DISPS: readonly string[] = ['none', 'applied', 'answered', 'declined', 'needs_clarification'];

function toThread(v: unknown): ThreadMessage[] {
  if (!Array.isArray(v)) return [];
  const out: ThreadMessage[] = [];
  for (const m of v) {
    if (!isObj(m)) continue;
    const by = str(m.by);
    const at = str(m.at);
    const body = str(m.body);
    if ((by === 'reviewer' || by === 'agent') && at !== undefined && body !== undefined) {
      out.push({ by, at, body });
    }
  }
  return out;
}

/**
 * Read every `mw:log` record into a NoteView. Records that are not valid objects, or lack an `id`,
 * are skipped (lint is the safety net for those). The result is sorted in DOCUMENT order - the
 * order the notes' first markers appear in the prose - which is the order the rail shows them
 * (spec section 5). Notes whose marker is missing sort to the end, preserving log order among them.
 */
export function extractNotes(source: string): NoteView[] {
  const doc = parse(source);

  // First marker offset per id, for document-order sorting.
  const firstOffset = new Map<string, number>();
  for (const m of doc.markers) {
    if (!firstOffset.has(m.id)) firstOffset.set(m.id, m.offset);
  }

  const notes: NoteView[] = [];
  for (const b of doc.blocks) {
    if (b.name !== 'log') continue;
    for (const r of b.records) {
      if (!isObj(r.json)) continue;
      const o = r.json;
      const id = str(o.id);
      if (id === undefined) continue;

      const type: NoteType = NOTE_TYPES.includes(str(o.type) ?? '') ? (o.type as NoteType) : 'comment';
      const state: ReviewState = STATES.includes(str(o.state) ?? '') ? (o.state as ReviewState) : 'open';
      const disp: Disposition = DISPS.includes(str(o.disp) ?? '') ? (o.disp as Disposition) : 'none';
      const anchorKind: AnchorKind =
        isObj(o.anchor) && str(o.anchor.kind) === 'point' ? 'point' : 'span';
      const text = str(o.text);

      notes.push({ id, type, anchorKind, state, disp, text, thread: toThread(o.thread) });
    }
  }

  const ORPHAN = Number.MAX_SAFE_INTEGER;
  return notes
    .map((n, i) => ({ n, i, off: firstOffset.get(n.id) ?? ORPHAN }))
    .sort((a, b) => a.off - b.off || a.i - b.i)
    .map((x) => x.n);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run test/preview/notes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/preview/types.ts src/preview/notes.ts test/preview/notes.test.ts
git commit -m "feat(preview): extract mw:log records into a NoteView model"
```

---

## Task 3: Render markers as spans and the document as HTML

**Files:**
- Create: `src/preview/render.ts`
- Test: `test/preview/render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/preview/render.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { injectMarkerSpans, renderDocumentHtml } from '../../src/preview/render.js';
import { extractNotes } from '../../src/preview/notes.js';

const DOC = `# Title

The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> next year.<!-- mw:s2 -->

The market is <!-- mw:s3 -->large<!-- /mw:s3 -->.

A code sample: \`<!-- mw:cf -->\`

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"00000000","before":"ships by ","after":" next"},"text":"Q4","thread":[]}
{"id":"s2","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"next year."},"text":" More.","thread":[]}
{"id":"s3","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"00000000","before":"market is ","after":"."},"thread":[]}
-->
`;

describe('injectMarkerSpans', () => {
  it('wraps a span note in a typed span and drops the markers', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).toContain('<span class="mw-span mw-type-replace" data-mw-id="s1">Q3</span>');
    expect(out).not.toContain('<!-- mw:s1 -->');
    expect(out).not.toContain('<!-- /mw:s1 -->');
  });

  it('renders a point note as a self-closing typed span', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).toContain('<span class="mw-point mw-type-insert" data-mw-id="s2"></span>');
  });

  it('removes the mw:log block entirely', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).not.toContain('mw:log');
    expect(out).not.toContain('"id":"s1"');
  });

  it('leaves markers inside code spans/fences untouched', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).toContain('`<!-- mw:cf -->`');
  });
});

describe('renderDocumentHtml', () => {
  it('renders markdown with the highlight spans surviving', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<span class="mw-span mw-type-replace" data-mw-id="s1">Q3</span>');
    expect(html).toContain('data-mw-id="s2"');
    expect(html).not.toContain('mw:log');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/preview/render.test.ts`
Expected: FAIL - `Cannot find module '../../src/preview/render.js'`.

- [ ] **Step 3: Write the renderer**

Create `src/preview/render.ts`:
```ts
import MarkdownIt from 'markdown-it';
import { parse } from '../parse.js';
import { extractNotes } from './notes.js';
import type { NoteView } from './types.js';

// Matches a whole mw:log / mw:archive comment block (single HTML comment ending at its first
// `-->`; clean records never contain `-->`, enforced by lint L130). Same pattern strip.ts uses.
const BLOCK_RE = /<!--\s*mw:(?:log|archive)\b[\s\S]*?-->/g;

const escapeAttr = (s: string): string => s.replace(/"/g, '&quot;');

/**
 * Turn a Markwise source string into markdown ready for rendering: every inline `mw:` marker that
 * belongs to a known note becomes a highlight `<span>` (the easy, read-only direction), and the
 * `mw:log` / `mw:archive` blocks are removed. Markers inside code fences/spans are left as literal
 * text (the reviewer is looking at code, not an annotation). Orphan markers (no matching record)
 * are dropped. Pure string transform; offsets come from the shared parser so code-fence awareness
 * is exactly the linter's.
 */
export function injectMarkerSpans(source: string, notes: NoteView[]): string {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const doc = parse(source);

  // Build replacements keyed by absolute offset, then apply right-to-left so earlier offsets stay
  // valid as we splice.
  const edits: Array<{ offset: number; end: number; text: string }> = [];
  for (const m of doc.markers) {
    if (m.inCodeFence) continue;
    const note = byId.get(m.id);
    if (!note) {
      edits.push({ offset: m.offset, end: m.end, text: '' }); // drop orphan marker
      continue;
    }
    const typeClass = `mw-type-${note.type}`;
    if (note.anchorKind === 'point') {
      edits.push({
        offset: m.offset,
        end: m.end,
        text: `<span class="mw-point ${typeClass}" data-mw-id="${escapeAttr(m.id)}"></span>`,
      });
    } else {
      edits.push({
        offset: m.offset,
        end: m.end,
        text: m.isClose
          ? '</span>'
          : `<span class="mw-span ${typeClass}" data-mw-id="${escapeAttr(m.id)}">`,
      });
    }
  }

  edits.sort((a, b) => b.offset - a.offset);
  let out = source;
  for (const e of edits) out = out.slice(0, e.offset) + e.text + out.slice(e.end);

  // Remove the log/archive blocks (they hold no inline markers, so this is safe after splicing)
  // and tidy the trailing whitespace the removed block leaves behind.
  out = out.replace(BLOCK_RE, '');
  out = out.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  return out.length > 0 ? out + '\n' : out;
}

// One shared renderer instance. html:true lets the injected <span>s pass through (the document is
// the reviewer's own local file, served only to localhost - see the security note in the plan).
const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

/** Render a Markwise document to display HTML with note-highlight spans in place. */
export function renderDocumentHtml(source: string): string {
  const notes = extractNotes(source);
  return md.render(injectMarkerSpans(source, notes));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/preview/render.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/preview/render.ts test/preview/render.test.ts
git commit -m "feat(preview): render markers as highlight spans and document as HTML"
```

---

## Task 4: Assemble the doc payload - `buildDocPayload`

**Files:**
- Create: `src/preview/payload.ts`
- Test: `test/preview/payload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/preview/payload.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildDocPayload } from '../../src/preview/payload.js';

const DOC = `# Quarterly Plan

Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.<!-- mw:s2 -->

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}
{"id":"s2","type":"insert","state":"resolved","disp":"applied","anchor":{"kind":"point","before":"."},"text":"x","thread":[]}
-->
`;

describe('buildDocPayload', () => {
  it('uses the first H1 as the title', () => {
    const p = buildDocPayload(DOC, '/tmp/plan.md');
    expect(p.title).toBe('Quarterly Plan');
  });

  it('falls back to the file basename when there is no H1', () => {
    const p = buildDocPayload('Just prose.\n', '/tmp/notes.md');
    expect(p.title).toBe('notes.md');
  });

  it('includes only OPEN notes and counts them', () => {
    const p = buildDocPayload(DOC, '/tmp/plan.md');
    expect(p.notes.map((n) => n.id)).toEqual(['s1']);
    expect(p.openCount).toBe(1);
  });

  it('includes rendered html with the highlight span', () => {
    const p = buildDocPayload(DOC, '/tmp/plan.md');
    expect(p.html).toContain('data-mw-id="s1"');
    expect(p.html).toContain('<h1>Quarterly Plan</h1>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/preview/payload.test.ts`
Expected: FAIL - `Cannot find module '../../src/preview/payload.js'`.

- [ ] **Step 3: Write `buildDocPayload`**

Create `src/preview/payload.ts`:
```ts
import { basename } from 'node:path';
import { extractNotes } from './notes.js';
import { renderDocumentHtml } from './render.js';
import type { DocPayload } from './types.js';

function firstH1(source: string): string | undefined {
  for (const line of source.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Pure assembler for GET /api/doc: title + rendered HTML + the open notes (document order) + count.
 * Resolved notes are excluded from the rail and the counter in v0 (the archive browse view is
 * deferred - spec section 14); their markers are normally already stripped from the prose on resolve.
 */
export function buildDocPayload(source: string, filePath: string): DocPayload {
  const open = extractNotes(source).filter((n) => n.state === 'open');
  return {
    title: firstH1(source) ?? basename(filePath),
    html: renderDocumentHtml(source),
    notes: open,
    openCount: open.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/preview/payload.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/preview/payload.ts test/preview/payload.test.ts
git commit -m "feat(preview): assemble the /api/doc payload"
```

---

## Task 5: The preview server

**Files:**
- Create: `src/preview/server.ts`
- Test: `test/preview/server.test.ts`

Note: the server reads its static assets from `./assets/` relative to the *compiled* module (`dist/preview/server.js` -> `dist/preview/assets/`). Those assets are created and copied by the build step in Task 7. This task's test only exercises `/api/doc` and the 404 path, so it passes without the assets present.

- [ ] **Step 1: Write the failing test**

Create `test/preview/server.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createPreviewServer } from '../../src/preview/server.js';

const DOC = `# Demo

Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}
-->
`;

let server: Server | null = null;
let dir: string | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function start(doc: string): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'mw-preview-'));
  const file = join(dir, 'demo.md');
  writeFileSync(file, doc, 'utf8');
  server = createPreviewServer(file);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('createPreviewServer', () => {
  it('serves the current file as JSON at /api/doc', async () => {
    const base = await start(DOC);
    const res = await fetch(`${base}/api/doc`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.title).toBe('Demo');
    expect(body.openCount).toBe(1);
    expect(body.notes[0].id).toBe('s1');
    expect(body.html).toContain('data-mw-id="s1"');
  });

  it('reflects external edits on the next request (re-reads the file)', async () => {
    const base = await start(DOC);
    writeFileSync(join(dir!, 'demo.md'), '# Changed\n\nNo notes.\n', 'utf8');
    const body = await (await fetch(`${base}/api/doc`)).json();
    expect(body.title).toBe('Changed');
    expect(body.openCount).toBe(0);
  });

  it('404s an unknown path', async () => {
    const base = await start(DOC);
    const res = await fetch(`${base}/nope.txt`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/preview/server.test.ts`
Expected: FAIL - `Cannot find module '../../src/preview/server.js'`.

- [ ] **Step 3: Write the server**

Create `src/preview/server.ts`:
```ts
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { buildDocPayload } from './payload.js';

// Static assets live next to the compiled server (dist/preview/assets/, populated by the build's
// copy step). Resolved relative to this module so it works whether run from source-test or dist.
const ASSET_DIR = new URL('./assets/', import.meta.url);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

/**
 * A localhost-only HTTP server for one document. GET /api/doc re-reads the file every request (so
 * external edits and, later, our own writes show up on refresh) and returns buildDocPayload(...).
 * Everything else is a static asset served from ASSET_DIR. Bind with `.listen(0, '127.0.0.1')`.
 */
export function createPreviewServer(filePath: string): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/api/doc') {
        const source = readFileSync(filePath, 'utf8');
        const payload = buildDocPayload(source, filePath);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
        return;
      }

      if (req.method === 'GET') {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
        // No path traversal: a single flat filename with a known extension only.
        if (/^[a-zA-Z0-9._-]+$/.test(name) && MIME[extname(name)]) {
          try {
            const data = await readFile(new URL(name, ASSET_DIR));
            res.writeHead(200, { 'content-type': MIME[extname(name)]! });
            res.end(data);
            return;
          } catch {
            // fall through to 404
          }
        }
      }

      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Server error');
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/preview/server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/preview/server.ts test/preview/server.test.ts
git commit -m "feat(preview): localhost server with /api/doc and static assets"
```

---

## Task 6: The `markwise preview` CLI command

**Files:**
- Modify: `src/cli.ts`

This task wires a long-running command. There is no unit test (it owns process lifetime and opens a browser); it is verified manually in Task 8 once the assets exist. Build-verify only here.

- [ ] **Step 1: Add the imports**

In `src/cli.ts`, add to the import block at the top (after the existing `import { stripText } ...` line):
```ts
import { spawn } from 'node:child_process';
import { createPreviewServer } from './preview/server.js';
```

- [ ] **Step 2: Extend the usage text**

In the `USAGE` template string in `src/cli.ts`, add a `preview` line under `Usage:` (after the `export` line):
```
  markwise preview <file>                    open the document in a local web previewer
```

- [ ] **Step 3: Add the open-browser helper and the command**

In `src/cli.ts`, add these two functions just above `function main(): void {`:
```ts
function openBrowser(url: string): void {
  // Best-effort. Failure is non-fatal: the URL is already printed for the reviewer to open.
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* ignore */
  }
}

function previewCommand(args: Args): void {
  if (args.files.length !== 1) {
    process.stderr.write('markwise preview: expects exactly one input file\n');
    process.exit(2);
  }
  const file = args.files[0]!;
  try {
    readFileSync(file, 'utf8');
  } catch {
    process.stderr.write(`markwise: cannot read ${file}\n`);
    process.exit(2);
  }

  const server = createPreviewServer(file);
  server.on('error', (err) => {
    process.stderr.write(`markwise preview: server error: ${(err as Error).message}\n`);
    process.exit(1);
  });
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const url = `http://127.0.0.1:${port}/`;
    process.stdout.write(`markwise preview: serving ${file}\n  ${url}\n  (Ctrl+C to stop)\n`);
    openBrowser(url);
  });
  // Intentionally does not return / exit: the listening server keeps the event loop alive.
}
```

- [ ] **Step 4: Dispatch the command in `main()`**

In `src/cli.ts`, inside `main()`, add this block BEFORE the existing `if (args.command === 'lint')` line:
```ts
  if (args.command === 'preview') {
    previewCommand(args);
    return; // long-running; do not process.exit
  }
```

- [ ] **Step 5: Verify it builds**

Run: `pnpm build`
Expected: exit 0, no tsc errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts
git commit -m "feat(preview): add the markwise preview command"
```

---

## Task 7: Browser app shell, assets, and the build copy step

**Files:**
- Create: `src/preview/assets/index.html`
- Create: `src/preview/assets/app.js`
- Create: `scripts/copy-preview-assets.mjs`
- Modify: `package.json`

(`app.css` is created in Task 8; the app is functional-but-unstyled after this task.)

- [ ] **Step 1: Write the app shell**

Create `src/preview/assets/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Markwise Preview</title>
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body class="mw-clean">
    <header class="mw-toolbar">
      <div class="mw-brand">
        <span class="mw-wordmark">Markwise</span>
        <span class="mw-doctitle"></span>
      </div>
      <div class="mw-tools">
        <button type="button" class="mw-counter" aria-pressed="false">
          <span class="mw-count">0</span> notes
        </button>
        <button type="button" class="mw-done" disabled title="Available in the next milestone">
          Done reviewing
        </button>
      </div>
    </header>
    <main class="mw-stage">
      <article class="mw-doc" aria-label="document"></article>
      <aside class="mw-rail" aria-label="notes"></aside>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the browser app**

Create `src/preview/assets/app.js`:
```js
// Markwise previewer - read-only browser app. No build step, no framework: it fetches the
// server-rendered document payload, drops the HTML into the reading column, builds the notes rail,
// and wires the clean<->revealed toggle plus one-at-a-time, bidirectional note activation.
// Mutation (create / reply / resolve / handoff) is the next milestone; those controls render here
// disabled so the layout is real for review.

(function () {
  'use strict';

  const body = document.body;
  const docEl = document.querySelector('.mw-doc');
  const railEl = document.querySelector('.mw-rail');
  const titleEl = document.querySelector('.mw-doctitle');
  const counterBtn = document.querySelector('.mw-counter');
  const countEl = document.querySelector('.mw-count');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function idSel(id) {
    const safe = window.CSS && CSS.escape ? CSS.escape(id) : id;
    return '[data-mw-id="' + safe + '"]';
  }

  function fmtTime(at) {
    // Show the stored timestamp verbatim if it does not parse; otherwise a short local form.
    const d = new Date(at);
    return isNaN(d.getTime()) ? at : d.toLocaleString();
  }

  function noteSnippet(note) {
    if (note.type === 'insert' || note.type === 'replace') {
      return note.text ? '"' + note.text + '"' : '';
    }
    const last = note.thread[note.thread.length - 1];
    return last ? last.body : '';
  }

  function renderRail(notes) {
    railEl.innerHTML = '';
    notes.forEach(function (note) {
      const card = document.createElement('section');
      card.className = 'mw-card mw-type-' + note.type;
      card.dataset.mwId = note.id;

      const head = document.createElement('header');
      head.className = 'mw-card-head';
      head.innerHTML =
        '<span class="mw-card-type">' + esc(note.type) + '</span>' +
        '<span class="mw-card-snippet">' + esc(noteSnippet(note)) + '</span>';
      card.appendChild(head);

      const threadEl = document.createElement('div');
      threadEl.className = 'mw-thread';
      note.thread.forEach(function (m) {
        const msg = document.createElement('div');
        msg.className = 'mw-msg mw-by-' + m.by;
        msg.innerHTML =
          '<div class="mw-msg-meta"><span class="mw-msg-by">' + esc(m.by) + '</span>' +
          '<span class="mw-msg-at">' + esc(fmtTime(m.at)) + '</span></div>' +
          '<div class="mw-msg-body">' + esc(m.body) + '</div>';
        threadEl.appendChild(msg);
      });
      card.appendChild(threadEl);

      // Composition + verbs are disabled in the read-only milestone (shown for layout).
      const actions = document.createElement('div');
      actions.className = 'mw-card-actions';
      actions.innerHTML =
        '<textarea class="mw-reply" placeholder="Reply..." disabled></textarea>' +
        '<div class="mw-verbs">' +
        '<button type="button" class="mw-reply-btn" disabled>Reply</button>' +
        '<button type="button" class="mw-resolve-btn" disabled>Resolve</button>' +
        '</div>';
      card.appendChild(actions);

      card.addEventListener('click', function () {
        activate(note.id);
      });
      railEl.appendChild(card);
    });
  }

  function activate(id) {
    if (id != null && body.classList.contains('mw-clean')) reveal(true);
    document.querySelectorAll('.active').forEach(function (el) {
      el.classList.remove('active');
    });
    if (id == null) return;
    document.querySelectorAll(idSel(id)).forEach(function (el) {
      el.classList.add('active');
    });
    const activeCard = railEl.querySelector('.mw-card' + idSel(id));
    if (activeCard) activeCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function reveal(on) {
    body.classList.toggle('mw-clean', !on);
    body.classList.toggle('mw-revealed', on);
    counterBtn.setAttribute('aria-pressed', String(on));
    if (!on) activate(null);
  }

  function wireProseActivation() {
    docEl.addEventListener('click', function (e) {
      const target = e.target.closest('[data-mw-id]');
      if (target) {
        activate(target.dataset.mwId);
        e.stopPropagation();
      } else {
        activate(null);
      }
    });
  }

  counterBtn.addEventListener('click', function () {
    reveal(body.classList.contains('mw-clean'));
  });

  fetch('/api/doc')
    .then(function (r) { return r.json(); })
    .then(function (payload) {
      titleEl.textContent = payload.title || '';
      document.title = (payload.title ? payload.title + ' - ' : '') + 'Markwise Preview';
      docEl.innerHTML = payload.html || '';
      countEl.textContent = String(payload.openCount || 0);
      renderRail(payload.notes || []);
      wireProseActivation();
    })
    .catch(function (err) {
      docEl.innerHTML = '<p class="mw-error">Could not load the document.</p>';
      console.error('[markwise] failed to load /api/doc', err);
    });
})();
```

- [ ] **Step 3: Write the asset copy script**

Create `scripts/copy-preview-assets.mjs`:
```js
// tsc only emits .js from .ts, so the previewer's static assets (html/css/js) must be copied into
// dist so the compiled server can serve them. Run as part of `pnpm build`.
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src/preview/assets/', import.meta.url));
const dest = fileURLToPath(new URL('../dist/preview/assets/', import.meta.url));

await cp(src, dest, { recursive: true });
console.log(`copied preview assets -> ${dest}`);
```

- [ ] **Step 4: Wire the build script**

In `package.json`, change the `build` script (leave `files` as-is - `dist` already covers `dist/preview/assets`):
```json
  "scripts": {
    "build": "tsc -p tsconfig.json && node scripts/copy-preview-assets.mjs",
    "lint:self": "node ./dist/cli.js lint sample.md",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 5: Build and confirm assets land in dist**

Run:
```bash
pnpm build && ls dist/preview/assets
```
Expected: build exits 0; `ls` shows `app.js` and `index.html`.

- [ ] **Step 6: Commit**

```bash
git add src/preview/assets/index.html src/preview/assets/app.js scripts/copy-preview-assets.mjs package.json
git commit -m "feat(preview): browser app shell, rail, activation, and asset build step"
```

---

## Task 8: Styling - clean read, note treatments, active shading

**Files:**
- Create: `src/preview/assets/app.css`

This is the visual layer (spec section 1 through section 5). No automated test; verified by opening the previewer.

- [ ] **Step 1: Write the stylesheet**

Create `src/preview/assets/app.css`:
```css
:root {
  --mw-ink: #1d1d1f;
  --mw-muted: #6b6b70;
  --mw-line: #e6e6e8;
  --mw-bg: #ffffff;
  --mw-comment: #fff3c4;     /* comment tint */
  --mw-comment-deep: #ffe27a;
  --mw-replace: #cfe8ff;     /* suggested replace */
  --mw-replace-deep: #9fd0ff;
  --mw-delete: #ffd6d6;      /* delete */
  --mw-delete-deep: #ffadad;
  --mw-insert: #1f8f4e;      /* insert pillar */
  --mw-col: 680px;
  --mw-rail-w: 320px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  background: var(--mw-bg);
  color: var(--mw-ink);
  font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* Toolbar (spec section 2) */
.mw-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: saturate(180%) blur(8px);
  border-bottom: 1px solid var(--mw-line);
}
.mw-wordmark { font-weight: 700; letter-spacing: -0.01em; }
.mw-doctitle { margin-left: 12px; color: var(--mw-muted); }
.mw-tools { display: flex; align-items: center; gap: 12px; }

.mw-counter {
  border: 1px solid var(--mw-line);
  background: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.mw-counter[aria-pressed="true"] { background: #111; color: #fff; border-color: #111; }
.mw-done {
  border: 1px solid var(--mw-line);
  background: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  font: inherit;
  font-size: 14px;
  opacity: 0.5;
}

/* Stage: reading column + rail (spec section 1, section 5) */
.mw-stage { display: flex; justify-content: center; gap: 32px; padding: 48px 24px 120px; }
.mw-doc { width: 100%; max-width: var(--mw-col); }
.mw-doc h1 { font-size: 2rem; line-height: 1.25; margin: 0 0 0.6em; }
.mw-doc h2 { font-size: 1.5rem; margin: 1.6em 0 0.5em; }
.mw-doc p { margin: 0 0 1.1em; }
.mw-doc pre { background: #f5f5f7; padding: 14px 16px; border-radius: 8px; overflow: auto; }
.mw-doc code { background: #f0f0f2; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.9em; }
.mw-doc pre code { background: none; padding: 0; }

/* Rail */
.mw-rail {
  width: var(--mw-rail-w);
  flex: 0 0 var(--mw-rail-w);
  display: none;
}
.mw-revealed .mw-rail { display: block; }

/* --- Clean read: no highlights, no rail (spec section 1, section 3) --- */
.mw-clean .mw-span { background: none; text-decoration: none; }
.mw-clean .mw-point { display: none; }

/* --- Notes revealed: in-prose treatments (spec section 4) --- */
.mw-revealed .mw-span { border-radius: 3px; padding: 0 1px; cursor: pointer; }
.mw-revealed .mw-span.mw-type-comment { background: var(--mw-comment); }
.mw-revealed .mw-span.mw-type-replace { background: var(--mw-replace); text-decoration: underline; text-decoration-color: var(--mw-replace-deep); }
.mw-revealed .mw-span.mw-type-delete  { background: var(--mw-delete); text-decoration: line-through; }

.mw-revealed .mw-point {
  display: inline-block;
  width: 3px;
  height: 1.1em;
  vertical-align: text-bottom;
  margin: 0 1px;
  border-radius: 2px;
  background: var(--mw-insert);
  cursor: pointer;
}

/* Active note: deeper shade (spec section 4) */
.mw-revealed .mw-span.mw-type-comment.active { background: var(--mw-comment-deep); }
.mw-revealed .mw-span.mw-type-replace.active { background: var(--mw-replace-deep); }
.mw-revealed .mw-span.mw-type-delete.active  { background: var(--mw-delete-deep); }
.mw-revealed .mw-point.active { outline: 2px solid var(--mw-insert); outline-offset: 1px; }

/* Cards */
.mw-card {
  border: 1px solid var(--mw-line);
  border-radius: 10px;
  background: #fff;
  padding: 12px 14px;
  margin-bottom: 12px;
  cursor: pointer;
}
.mw-card.active { border-color: #111; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06); }
.mw-card-head { display: flex; gap: 8px; align-items: baseline; }
.mw-card-type {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--mw-muted);
  border: 1px solid var(--mw-line);
  border-radius: 999px;
  padding: 1px 7px;
  flex: 0 0 auto;
}
.mw-card-snippet { color: var(--mw-ink); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Thread + actions only show on the active card (one active at a time, spec section 5) */
.mw-thread, .mw-card-actions { display: none; }
.mw-card.active .mw-thread { display: block; margin-top: 10px; }
.mw-card.active .mw-card-actions { display: block; margin-top: 10px; }

.mw-msg { padding: 8px 0; border-top: 1px solid var(--mw-line); }
.mw-msg-meta { display: flex; gap: 8px; font-size: 12px; color: var(--mw-muted); margin-bottom: 2px; }
.mw-msg-by { font-weight: 600; text-transform: capitalize; }
.mw-msg-body { font-size: 14px; }

.mw-reply { width: 100%; min-height: 56px; border: 1px solid var(--mw-line); border-radius: 8px; padding: 8px; font: inherit; font-size: 14px; resize: vertical; }
.mw-verbs { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.mw-verbs button { border: 1px solid var(--mw-line); background: #fff; border-radius: 8px; padding: 5px 12px; font: inherit; font-size: 13px; }

.mw-error { color: #b00020; }
```

- [ ] **Step 2: Rebuild so the CSS is copied into dist**

Run: `pnpm build`
Expected: exit 0; `dist/preview/assets/app.css` exists.

- [ ] **Step 3: Manual verification - end to end**

Run:
```bash
node dist/cli.js preview sample.md
```
Then in the browser that opens (or the printed `http://127.0.0.1:<port>/`), verify against the spec:

1. **Opening state (section 1):** the document renders as a centered, single reading column. No highlights, no rail - just the prose. The toolbar shows "Markwise", the doc title, and a `3 notes` counter (sample.md has 3 open notes).
2. **Reveal toggle (section 3):** click the counter. The rail appears on the right with 3 cards in document order (`s1` replace, `s2` insert, `s3` delete), and the prose shows: a blue underlined "Q3" (replace), a green pillar after "next year." (insert point), and a red strike-through "large and growing" (delete). Click the counter again - back to clean read, rail gone.
3. **Activation, bidirectional (section 5, section 4):** with notes revealed, click the "Q3" highlight - its card expands (showing the thread "Use Q4 - auth slips to fall.") and both the highlight and the card take a deeper shade / active border. Click a different card - the previous one collapses; only one is active. Click empty prose - all deactivate.
4. **Disabled controls:** the active card shows a greyed-out reply box and Reply/Resolve buttons, and "Done reviewing" is greyed - these are wired in the next milestone.

Stop the server with Ctrl+C.

If anything does not match, fix the CSS/JS and rebuild before committing.

- [ ] **Step 4: Run the full test suite and build**

Run: `pnpm test && pnpm build`
Expected: all tests pass; build exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/preview/assets/app.css
git commit -m "feat(preview): clean-read styling, note treatments, and active shading"
```

---

## Self-Review

**Spec coverage (read-only scope):**
- section 1 Opening state -> Task 8 step 3.1 (centered column, no chrome). Covered.
- section 2 Toolbar (wordmark + title left; counter + Done right) -> Task 7 index.html + Task 8 CSS. Covered. ("Done reviewing" present but disabled - functional in M2.)
- section 3 Counter shows all open notes + doubles as the clean<->revealed toggle -> Task 7 `reveal()`/counter + Task 4 `openCount`. Covered.
- section 4 Note rendering (span comment/replace/delete treatments, point pillar, active deep-shade) -> Task 3 typed spans + Task 8 CSS. Covered.
- section 5 Rail (cards in document order, one active at a time, expand thread + reply box + actions, bidirectional activation) -> Task 2 ordering + Task 7 rail/`activate()`. Covered. (reply box + verbs disabled - M2.)
- section 13 Reuse the core as a library -> Task 1 `src/index.ts`. Covered.
- section 6 verbs, section 7 ladder, section 8 composition, section 9 resolve, section 10 discard, section 11 handoff -> **deferred to Milestone 2** (explicitly out of this plan's scope). Not gaps.

**Placeholder scan:** No TBD/TODO; every code step has complete content. Clear.

**Type consistency:** `NoteView` fields (`id`, `type`, `anchorKind`, `state`, `disp`, `text?`, `thread`) are defined once in Task 2 and used identically in Tasks 3-4 and the browser app (Task 7). `DocPayload` (`title`, `html`, `notes`, `openCount`) defined in Task 2, produced in Task 4, consumed in Task 7. `createPreviewServer(filePath)`, `buildDocPayload(source, filePath)`, `injectMarkerSpans(source, notes)`, `renderDocumentHtml(source)`, `extractNotes(source)` signatures match across tasks. Consistent.

**Known v0 limitations (documented, not gaps):**
- A note whose span crosses a markdown block boundary may render an imperfect highlight (markdown-it sees an unbalanced inline span). Real-world anchors are intra-block; cross-block anchoring is out of v0 scope.
- `markdown-it` runs with `html: true`, so raw HTML in the document is passed through. The previewer serves only to `127.0.0.1` and renders the reviewer's own local file, so this is acceptable for v0; a sanitizer is a fast-follow if untrusted documents ever get previewed.
- Resolved notes are excluded from the rail/counter (archive browse view deferred, spec section 14).

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** - execute tasks in this session with checkpoints.

After this milestone, **Milestone 2 (note creation, reply, resolve, "Done reviewing" handoff)** gets its own spec-derived plan - it owns the hard selection -> source-offset mapping (sections 7-8) and the in-file mutation functions (section 9, section 11).
