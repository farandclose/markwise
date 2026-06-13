# CRLF (Windows) Line-Ending Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every markwise command read CRLF (Windows) markdown files correctly and, on write, preserve the file's original line ending - so a Windows user can use the review loop with minimal diffs.

**Architecture:** Normalize at the I/O boundary. A new `src/eol.ts` provides pure helpers (`detectEol`, `toLf`, `applyEol`) plus thin file wrappers (`readDocument` -> normalizes to LF + reports the original ending; `writeDocument` -> re-applies that ending). Every place that reads a user document switches to `readDocument`, and every place that writes one switches to `writeDocument`. The parser, hashing, anchoring, lint, strip, fix, and mutation code are untouched - they keep operating on LF, which the boundary now guarantees.

**Tech Stack:** TypeScript (tsc), Node >= 20, pnpm 10.29.3, vitest (unit + HTTP integration), Playwright (e2e, unchanged), GitHub Actions CI matrix (the cross-OS proof).

---

## CRITICAL WORKSPACE NOTE

All work happens in the worktree **`/Users/saurabhmehta/Documents/imagineandbuild/markwise-crlf`** on branch **`crlf-support`** (off `main`). The primary checkout (`.../markwise`) is on `feat/site-how-it-works` for another terminal - do NOT touch it. Deps are already installed here; baseline is green (180 tests). Paths below are relative to the worktree root.

## File map

- `src/eol.ts` - new. `detectEol`, `toLf`, `applyEol`, `readDocument`, `writeDocument`.
- `test/eol-io.test.ts` - new. Unit tests for `src/eol.ts`.
- `src/preview/server.ts` - modify. `persist` read+write and `GET /api/doc` read switch to the wrappers.
- `test/preview/crlf.test.ts` - new. HTTP round-trip: CRLF document read correctly + preserved on write.
- `src/cli.ts` - modify. `lint` (read + `--fix` write), `status` (read), `prompt` (read), `export` (read + both write paths) switch to the wrappers.
- `test/crlf-cli.test.ts` - new. Read-composition + write-preserve tests for the CLI paths (build-independent).
- The existing `test/eol.test.ts` (repo-LF guard) stays unchanged.

## What this plan does NOT touch

- `src/parse.ts`, `src/lint.ts`, `src/hash.ts`, `src/status.ts`, `src/strip.ts`, `src/fix.ts`, `src/preview/mutate.ts`, `src/preview/payload.ts` - the core stays LF-only by design.
- Reads of our own package templates (`AGENT_PROMPT.md`, `AUTHOR_PROMPT.md`, `SETUP_PROMPT.md`) and static preview assets - not user documents.
- The `.gitattributes` repo policy (already in place).

---

### Task 0: Confirm worktree and baseline

**Files:** none changed.

- [ ] **Step 1: Confirm location and branch**

Run: `cd /Users/saurabhmehta/Documents/imagineandbuild/markwise-crlf && git rev-parse --abbrev-ref HEAD`
Expected: `crlf-support`

- [ ] **Step 2: Confirm a clean green baseline**

Run: `pnpm run build && pnpm test`
Expected: build succeeds; vitest reports all tests passing (180 at the time of writing). Do not proceed if red.

(No commit - nothing changed.)

---

### Task 1: The `src/eol.ts` module (TDD)

**Files:**
- Create: `src/eol.ts`
- Create: `test/eol-io.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/eol-io.test.ts`:

```ts
import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectEol, toLf, applyEol, readDocument, writeDocument } from '../src/eol.js';

test('detectEol: pure LF', () => {
  expect(detectEol('a\nb\nc')).toBe('\n');
});

test('detectEol: pure CRLF', () => {
  expect(detectEol('a\r\nb\r\nc')).toBe('\r\n');
});

test('detectEol: no line endings defaults to LF', () => {
  expect(detectEol('abc')).toBe('\n');
  expect(detectEol('')).toBe('\n');
});

test('detectEol: mixed favors the dominant ending (ties -> CRLF)', () => {
  expect(detectEol('a\r\nb\r\nc\nd')).toBe('\r\n'); // 2 CRLF vs 1 LF
  expect(detectEol('a\r\nb\nc\nd')).toBe('\n'); // 1 CRLF vs 2 LF
  expect(detectEol('a\r\nb\nc')).toBe('\r\n'); // 1 vs 1 tie -> CRLF
});

test('toLf: converts CRLF and lone CR to LF, idempotent on LF', () => {
  expect(toLf('a\r\nb\r\n')).toBe('a\nb\n');
  expect(toLf('a\rb\rc')).toBe('a\nb\nc'); // lone CR (classic Mac)
  expect(toLf('a\nb\n')).toBe('a\nb\n');
});

test('applyEol: LF passthrough, CRLF round-trips toLf', () => {
  expect(applyEol('a\nb\n', '\n')).toBe('a\nb\n');
  expect(applyEol('a\nb\n', '\r\n')).toBe('a\r\nb\r\n');
  const crlf = 'x\r\ny\r\nz';
  expect(applyEol(toLf(crlf), detectEol(crlf))).toBe(crlf); // exact round-trip
});

test('readDocument normalizes to LF and reports the original ending', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-eol-'));
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, 'a\r\nb\r\nc', 'utf8');
    const { source, eol } = readDocument(file);
    expect(source).toBe('a\nb\nc');
    expect(eol).toBe('\r\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDocument re-applies the ending to LF text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-eol-'));
  try {
    const file = join(dir, 'doc.md');
    writeDocument(file, 'a\nb\nc', '\r\n');
    expect(readFileSync(file, 'utf8')).toBe('a\r\nb\r\nc');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/eol-io.test.ts`
Expected: FAIL - `../src/eol.js` does not exist yet.

- [ ] **Step 3: Create `src/eol.ts`**

```ts
// Line-ending handling for markwise. The parser, hashing, and anchoring assume LF, so user
// documents are normalized to LF on read and the original ending is re-applied on write. This
// confines all CRLF awareness to the I/O boundary; the core never sees `\r`.
import { readFileSync, writeFileSync } from 'node:fs';

export type Eol = '\r\n' | '\n';

/**
 * The file's dominant line ending. CRLF when `\r\n` occurrences are at least as many as lone-LF
 * occurrences and at least one CRLF is present (ties favor CRLF); otherwise LF. A file with no
 * line endings is LF. Pure-CRLF and pure-LF files - the overwhelming majority - are unambiguous.
 */
export function detectEol(source: string): Eol {
  let crlf = 0;
  let lf = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      if (i > 0 && source[i - 1] === '\r') crlf++;
      else lf++;
    }
  }
  return crlf > 0 && crlf >= lf ? '\r\n' : '\n';
}

/** Normalize any line ending to LF: `\r\n` -> `\n`, then any lone `\r` -> `\n`. */
export function toLf(source: string): string {
  return source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Re-apply an ending to LF `text`. For CRLF, `\n` -> `\r\n`. Assumes `text` is already LF. */
export function applyEol(text: string, eol: Eol): string {
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

/** Read a user document: returns it normalized to LF plus its original ending for write-back. */
export function readDocument(file: string): { source: string; eol: Eol } {
  const raw = readFileSync(file, 'utf8');
  return { source: toLf(raw), eol: detectEol(raw) };
}

/** Write a user document, re-applying its original ending to the LF `text`. */
export function writeDocument(file: string, text: string, eol: Eol): void {
  writeFileSync(file, applyEol(text, eol), 'utf8');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/eol-io.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/eol.ts test/eol-io.test.ts
git commit -m "feat(eol): line-ending detect/normalize/apply + document read/write wrappers"
```

---

### Task 2: Wire the preview server, with a CRLF round-trip test (TDD)

The previewer is the main read-and-write path. `persist()` reads the file, checks a version hash, mutates, and writes; `GET /api/doc` reads and builds the browser payload. Switching both reads to `readDocument` (so the browser sees LF and the version hash is over LF on both sides) and the write to `writeDocument` makes the previewer CRLF-correct and preserving.

**Files:**
- Create: `test/preview/crlf.test.ts`
- Modify: `src/preview/server.ts`

- [ ] **Step 1: Write the failing test**

Create `test/preview/crlf.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createPreviewServer } from '../../src/preview/server.js';

const DOC_LF = `# Demo

Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}
-->
`;
const DOC_CRLF = DOC_LF.replace(/\n/g, '\r\n');

let server: Server | null = null;
let dir: string | null = null;
let file = '';

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function start(doc: string): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'mw-crlf-'));
  file = join(dir, 'demo.md');
  writeFileSync(file, doc, 'utf8');
  server = createPreviewServer(file);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function reply(base: string, id: string, body: string): Promise<Response> {
  const version = ((await (await fetch(`${base}/api/doc`)).json()) as { version: string }).version;
  return fetch(`${base}/api/note/${id}/reply`, {
    method: 'POST',
    headers: { 'x-mw-version': version, 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

describe('CRLF documents in the previewer', () => {
  it('reads a CRLF document correctly (notes parse)', async () => {
    const base = await start(DOC_CRLF);
    const body = await (await fetch(`${base}/api/doc`)).json();
    expect(body.notes[0].id).toBe('s1');
    expect(body.openCount).toBe(1);
  });

  it('preserves CRLF when saving a reply', async () => {
    const base = await start(DOC_CRLF);
    const res = await reply(base, 's1', 'Looks good');
    expect(res.status).toBe(200);
    const saved = readFileSync(file, 'utf8');
    expect(saved.includes('\r\n')).toBe(true); // still CRLF
    expect(/[^\r]\n/.test(saved)).toBe(false); // every LF is part of a CRLF (uniform)
    expect(saved).toContain('Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.'); // prose line intact
    expect(saved).toContain('Looks good'); // the reply landed
  });

  it('leaves an LF document as LF when saving a reply', async () => {
    const base = await start(DOC_LF);
    const res = await reply(base, 's1', 'Looks good');
    expect(res.status).toBe(200);
    const saved = readFileSync(file, 'utf8');
    expect(saved.includes('\r')).toBe(false); // still pure LF
    expect(saved).toContain('Looks good');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/preview/crlf.test.ts`
Expected: FAIL - the CRLF read test fails (the note does not parse / `notes[0]` is undefined) and/or the preserve test fails (saved file is mixed or LF), because the server has not been wired yet.

- [ ] **Step 3: Wire `src/preview/server.ts`**

Add the import (after the existing `import { shortHash } from '../hash.js';` line, line 9):

```ts
import { readDocument, writeDocument } from '../eol.js';
```

In `persist(...)`, replace the read at the top of the function:

```ts
  const source = readFileSync(filePath, 'utf8');
```

with:

```ts
  const { source, eol } = readDocument(filePath);
```

and replace the write near the end of `persist(...)`:

```ts
  writeFileSync(filePath, fixed, 'utf8');
```

with:

```ts
  writeDocument(filePath, fixed, eol);
```

In the `GET /api/doc` handler, replace:

```ts
        const source = readFileSync(filePath, 'utf8');
        const payload = buildDocPayload(source, filePath);
```

with:

```ts
        const { source } = readDocument(filePath);
        const payload = buildDocPayload(source, filePath);
```

Leave the `import { readFileSync, writeFileSync } from 'node:fs';` line as-is (the static-asset path and other code may still use them; unused-import cleanup, if any, is handled by the build).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/preview/crlf.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the existing server suite to confirm no regression**

Run: `pnpm exec vitest run test/preview/server.test.ts`
Expected: PASS (all existing server tests still green - LF behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/preview/server.ts test/preview/crlf.test.ts
git commit -m "feat(preview): read CRLF documents and preserve the ending on write"
```

---

### Task 3: Wire the CLI read/write sites (TDD)

The CLI command functions are not exported, so the tests exercise the same composition the CLI performs: `readDocument` + the (LF-only) core function for reads, and `writeDocument` for writes. After the test, wire `src/cli.ts` to use the wrappers at every user-document read and write.

**Files:**
- Create: `test/crlf-cli.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing test**

Create `test/crlf-cli.test.ts`:

```ts
import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync as rfs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readDocument, writeDocument } from '../src/eol.js';
import { lintText } from '../src/lint.js';
import { stripText } from '../src/strip.js';

// The CLI reads a user file with readDocument (normalizing to LF) before calling the LF-only core,
// and writes with writeDocument (re-applying the ending). These tests verify that exact pairing -
// the same composition lintCommand/exportCommand perform - without spawning the binary.

const samplePath = fileURLToPath(new URL('../sample.md', import.meta.url));

test('a CRLF copy of sample.md lints clean through the read path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-cli-'));
  try {
    const crlf = rfs(samplePath, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    const file = join(dir, 'sample.md');
    writeFileSync(file, crlf, 'utf8');
    const { source } = readDocument(file);
    expect(lintText(source)).toEqual([]); // clean - the exact bug a raw CRLF read produced
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('export of a CRLF document re-applies CRLF to the clean copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mw-cli-'));
  try {
    const file = join(dir, 'doc.md');
    const out = join(dir, 'clean.md');
    writeFileSync(file, '# T\r\n\r\nHi <!-- mw:n1 -->there<!-- /mw:n1 -->.\r\n', 'utf8');
    const { source, eol } = readDocument(file);
    writeDocument(out, stripText(source), eol);
    const written = readFileSync(out, 'utf8');
    expect(written.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(written)).toBe(false); // uniform CRLF
    expect(written).not.toContain('mw:'); // markers stripped
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it passes the read assertions but proves the wiring target**

Run: `pnpm exec vitest run test/crlf-cli.test.ts`
Expected: PASS - these tests exercise `readDocument`/`writeDocument` (built in Task 1) directly, so they pass already. They lock in the read/write contract the CLI must use. (They will catch a regression if `eol.ts` changes.) Proceed to wire the CLI so the CLI actually performs this composition.

- [ ] **Step 3: Wire `src/cli.ts` - import**

Add after the existing `import { stripText } from './strip.js';` line (line 9):

```ts
import { readDocument, writeDocument } from './eol.js';
```

- [ ] **Step 4: Wire `src/cli.ts` - `lintCommand` read and `--fix` write**

Replace:

```ts
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      process.stderr.write(`markwise: cannot read ${file}\n`);
      return 2;
    }

    let fixChanges: string[] = [];
    if (args.fix) {
      const { output, changes } = fixText(source);
      fixChanges = changes;
      if (output !== source) {
        writeFileSync(file, output, 'utf8');
        source = output;
      }
    }
```

with:

```ts
    let source: string;
    let eol: '\r\n' | '\n';
    try {
      ({ source, eol } = readDocument(file));
    } catch {
      process.stderr.write(`markwise: cannot read ${file}\n`);
      return 2;
    }

    let fixChanges: string[] = [];
    if (args.fix) {
      const { output, changes } = fixText(source);
      fixChanges = changes;
      if (output !== source) {
        writeDocument(file, output, eol);
        source = output;
      }
    }
```

- [ ] **Step 5: Wire `src/cli.ts` - `statusCommand` read**

Replace:

```ts
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      process.stderr.write(`markwise: cannot read ${file}\n`);
      return 2;
    }
    const report = status(source);
```

with:

```ts
    let source: string;
    try {
      ({ source } = readDocument(file));
    } catch {
      process.stderr.write(`markwise: cannot read ${file}\n`);
      return 2;
    }
    const report = status(source);
```

- [ ] **Step 6: Wire `src/cli.ts` - `promptCommand` read**

Replace:

```ts
  let document: string;
  try {
    document = readFileSync(file, 'utf8');
  } catch {
    process.stderr.write(`markwise: cannot read ${file}\n`);
    return 2;
  }
```

with:

```ts
  let document: string;
  try {
    ({ source: document } = readDocument(file));
  } catch {
    process.stderr.write(`markwise: cannot read ${file}\n`);
    return 2;
  }
```

(The `template` read just below uses `new URL('../AGENT_PROMPT.md', ...)` - a package file, NOT a user document - and stays `readFileSync`.)

- [ ] **Step 7: Wire `src/cli.ts` - `exportCommand` read and both writes**

Replace:

```ts
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    process.stderr.write(`markwise: cannot read ${file}\n`);
    return 2;
  }

  const clean = stripText(source);

  if (args.output) {
    try {
      writeFileSync(args.output, clean, 'utf8');
    } catch {
      process.stderr.write(`markwise: cannot write ${args.output}\n`);
      return 2;
    }
    process.stderr.write(`Wrote clean copy to ${args.output} (original untouched)\n`);
  } else {
    process.stdout.write(clean);
  }
```

with:

```ts
  let source: string;
  let eol: '\r\n' | '\n';
  try {
    ({ source, eol } = readDocument(file));
  } catch {
    process.stderr.write(`markwise: cannot read ${file}\n`);
    return 2;
  }

  const clean = stripText(source);

  if (args.output) {
    try {
      writeDocument(args.output, clean, eol);
    } catch {
      process.stderr.write(`markwise: cannot write ${args.output}\n`);
      return 2;
    }
    process.stderr.write(`Wrote clean copy to ${args.output} (original untouched)\n`);
  } else {
    process.stdout.write(applyEol(clean, eol));
  }
```

Add `applyEol` to the import from `./eol.js` (Step 3) so the stdout branch keeps the source ending too:

```ts
import { readDocument, writeDocument, applyEol } from './eol.js';
```

- [ ] **Step 8: Build and confirm `readFileSync`/`writeFileSync` are still used where needed**

Run: `pnpm run build`
Expected: compiles with no TypeScript errors. (`readFileSync` is still used for the package-template reads in `promptCommand`/`agentSetupCommand`, so its import stays. If `writeFileSync` is now unused in `cli.ts`, remove it from the line-2 import to keep the build clean: `import { readFileSync, accessSync, constants } from 'node:fs';`.)

- [ ] **Step 9: Run the CLI test and the full suite**

Run: `pnpm exec vitest run test/crlf-cli.test.ts && pnpm test`
Expected: the CLI test passes; the full suite is green (existing 180 + new tests).

- [ ] **Step 10: Commit**

```bash
git add src/cli.ts test/crlf-cli.test.ts
git commit -m "feat(cli): read CRLF documents and preserve the ending on lint --fix and export"
```

---

### Task 4: Full local gate and spec sync

**Files:**
- Modify: `docs/superpowers/specs/2026-06-13-crlf-support-design.md` (one-line sync only)

- [ ] **Step 1: Sync the spec to mention the I/O wrappers**

In `docs/superpowers/specs/2026-06-13-crlf-support-design.md`, in section "### 1. New module: `src/eol.ts`", append this line after the three function bullets:

```
- `readDocument(file)` / `writeDocument(file, text, eol)` - thin fs wrappers that apply the three
  functions, so each read/write site uses one tested helper rather than inlining the calls.
```

- [ ] **Step 2: Run the full verification gate**

Run:
```bash
pnpm run build && pnpm test
```
Expected: build clean; all tests pass.

- [ ] **Step 3: Confirm no stray raw read/write of a user document remains in cli/server**

Run: `grep -nE "readFileSync\(file|readFileSync\(filePath|writeFileSync\(file|writeFileSync\(args.output|writeFileSync\(filePath" src/cli.ts src/preview/server.ts`
Expected: no matches for user-document reads/writes (the only remaining `readFileSync` calls are the package-template reads via `new URL(...)`, which this grep does not match). If a user-document read/write still shows, wire it to the helpers.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-13-crlf-support-design.md
git commit -m "docs: note eol.ts read/write wrappers in the CRLF spec"
```

---

### Task 5: Push and prove on the cross-OS CI matrix

**Files:** none changed.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin crlf-support
```

- [ ] **Step 2: Confirm CI is green on all three OSes**

Run: `gh run list --branch crlf-support --limit 1` then watch the run (e.g. `gh run watch <id> --exit-status`), and verify per-job with `gh run view <id>`.
Expected: every `test (ubuntu/macos/windows, node 20/22)` job and the `e2e` job pass. The Windows jobs run on a forced-LF checkout (`.gitattributes`), so they prove the suite stays green; the new CRLF tests construct CRLF input in-process, so they prove CRLF handling on every OS.

- [ ] **Step 3: Open a PR (do not merge without the user's go-ahead)**

```bash
gh pr create --base main --head crlf-support \
  --title "feat: support CRLF (Windows) line endings, preserving them on write" \
  --body "Implements docs/superpowers/specs/2026-06-13-crlf-support-design.md. Normalizes user documents to LF on read and re-applies the original ending on write, via src/eol.ts used at every cli/server read/write site. Core parser/anchoring untouched. New tests: eol unit, preview CRLF round-trip, CLI read/preserve."
```

Then report the PR link and CI status to the user for the merge decision.

---

## Acceptance criteria (definition of done)

- `pnpm run build && pnpm test` green locally and on the CI matrix (Ubuntu/macOS/Windows, Node 20 and 22) plus the e2e job.
- A CRLF document reads correctly in `lint`, `status`, `prompt`, `export`, and the previewer.
- Saving via the previewer, `lint --fix`, or `export` preserves the source's line ending (CRLF stays CRLF, LF stays LF) with a minimal diff.
- The core modules (`parse`, `lint`, `hash`, `status`, `strip`, `fix`, `mutate`, `payload`) are unchanged.
- The existing 180 tests still pass.
