# Previewer "Hand to agent" Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Hand to agent" button to the previewer that copies a lean, path-based pickup ticket (delegating to `markwise prompt`) to the clipboard, so a reviewer can hand the document back to a repo-resident agent.

**Architecture:** A pure `buildHandoffText` helper produces the clipboard string. `buildDocPayload` gains a `handoff` field (path + waiting count + text), computed from `status(src).waitingOnAgent`, so the existing `GET /api/doc` carries it on every load with no new endpoint and no write path. The browser stores the latest `handoff`, enables/dims the header button by waiting count, and copies synchronously on click (sidestepping the Safari async-clipboard gotcha).

**Tech Stack:** TypeScript ESM (NodeNext, `.js` import specifiers), vitest, vanilla browser JS/CSS, Node `http`.

Spec: `docs/superpowers/specs/2026-06-05-previewer-handoff-design.md`.

---

## File Structure

- **Create** `src/preview/handoff.ts` - the pure `buildHandoffText({ path, waitingCount })` string builder. One responsibility: produce the clipboard ticket.
- **Create** `test/preview/handoff.test.ts` - unit tests for `buildHandoffText`.
- **Modify** `src/preview/types.ts` - add `HandoffInfo` and the `handoff` field on `DocPayload`.
- **Modify** `src/preview/payload.ts` - compute and include `handoff` in `buildDocPayload`.
- **Modify** `test/preview/payload.test.ts` - assert the handoff field (count 1 and count 0).
- **Modify** `test/preview/server.test.ts` - assert `/api/doc` surfaces the handoff (integration).
- **Modify** `src/preview/assets/index.html` - relabel the existing placeholder button to "Hand to agent".
- **Modify** `src/preview/assets/app.css` - style the activated button + disabled state.
- **Modify** `src/preview/assets/app.js` - store `handoff`, set the button enable state in `load()`, copy on click.

No changes to `mutate.ts`, `persist()`, `fix.ts`, or `lint.ts`: this feature never writes the file.

---

### Task 1: `buildHandoffText` pure helper

**Files:**
- Create: `src/preview/handoff.ts`
- Test: `test/preview/handoff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/preview/handoff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildHandoffText } from '../../src/preview/handoff.js';

describe('buildHandoffText', () => {
  it('uses a singular phrase for exactly one waiting note', () => {
    const text = buildHandoffText({ path: 'playground.md', waitingCount: 1 });
    expect(text).toContain('1 note is waiting on you');
    expect(text).not.toContain('1 notes');
  });

  it('uses a plural phrase for multiple waiting notes', () => {
    const text = buildHandoffText({ path: 'playground.md', waitingCount: 3 });
    expect(text).toContain('3 notes are waiting on you');
  });

  it('uses the plural phrase for a zero count', () => {
    const text = buildHandoffText({ path: 'playground.md', waitingCount: 0 });
    expect(text).toContain('0 notes are waiting on you');
  });

  it('interpolates the path into both the prose and the command', () => {
    const text = buildHandoffText({ path: 'docs/plan.md', waitingCount: 2 });
    expect(text).toContain('A Markwise review of `docs/plan.md` just finished.');
    expect(text).toContain('Run `markwise prompt docs/plan.md`');
  });

  it('contains no em-dash and no HTML-comment-breaking sequence', () => {
    const text = buildHandoffText({ path: 'a.md', waitingCount: 1 });
    expect(text).not.toContain('\u2014'); // em-dash (escaped so no literal em-dash lives in the repo)
    expect(text).not.toContain('-->');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/preview/handoff.test.ts`
Expected: FAIL - cannot find module `../../src/preview/handoff.js` / `buildHandoffText` is not a function.

- [ ] **Step 3: Write the minimal implementation**

Create `src/preview/handoff.ts`:

```ts
// Builds the clipboard "pickup ticket" the previewer's Hand-to-agent button copies. Pure and
// I/O-free, so it is trivially testable. The text references the protocol via `markwise prompt`
// rather than restating it (design D-b), and names the file by path rather than inlining it
// (design D-a). No em-dashes; avoid `--`/`-->` so a pasted ticket never confuses an HTML-comment
// parser (consistent with the protocol's own rule).

export interface HandoffInput {
  /** The path `markwise preview` was launched with. */
  path: string;
  /** How many open notes are the agent's turn (status(src).waitingOnAgent.length). */
  waitingCount: number;
}

export function buildHandoffText({ path, waitingCount }: HandoffInput): string {
  const countPhrase =
    waitingCount === 1 ? '1 note is waiting on you' : `${waitingCount} notes are waiting on you`;
  return (
    `A Markwise review of \`${path}\` just finished. ${countPhrase}.\n\n` +
    `Run \`markwise prompt ${path}\` to load the protocol and those notes, then act on them.`
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/preview/handoff.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/preview/handoff.ts test/preview/handoff.test.ts
git commit -m "Add buildHandoffText: the agent-handoff clipboard ticket"
```

---

### Task 2: Surface `handoff` in the `/api/doc` payload

**Files:**
- Modify: `src/preview/types.ts`
- Modify: `src/preview/payload.ts`
- Test: `test/preview/payload.test.ts`
- Test: `test/preview/server.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/preview/payload.test.ts`, add these two tests inside the `describe('buildDocPayload', ...)` block (after the existing `it('includes rendered html ...')`):

```ts
  it('surfaces a handoff ticket sized to the notes waiting on the agent', () => {
    const p = buildDocPayload(DOC, '/tmp/plan.md');
    expect(p.handoff.path).toBe('/tmp/plan.md');
    expect(p.handoff.waitingCount).toBe(1); // s1 is a new note (agent's turn); s2 is resolved
    expect(p.handoff.text).toContain('1 note is waiting on you');
    expect(p.handoff.text).toContain('markwise prompt /tmp/plan.md');
  });

  it('reports a zero waiting count for a document with no notes', () => {
    const p = buildDocPayload('Just prose.\n', '/tmp/notes.md');
    expect(p.handoff.waitingCount).toBe(0);
    expect(p.handoff.text).toContain('0 notes are waiting on you');
  });
```

In `test/preview/server.test.ts`, add this test inside the `describe('createPreviewServer', ...)` block (after the existing `it('serves the current file as JSON at /api/doc', ...)`):

```ts
  it('includes the agent-handoff ticket in /api/doc', async () => {
    const base = await start(DOC);
    const body = await (await fetch(`${base}/api/doc`)).json();
    expect(body.handoff.waitingCount).toBe(1); // s1 is the agent's turn (brand-new note)
    expect(body.handoff.text).toContain('1 note is waiting on you');
    expect(body.handoff.text).toContain('markwise prompt');
    expect(body.handoff.path).toContain('demo.md');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/payload.test.ts test/preview/server.test.ts`
Expected: FAIL - `p.handoff` is undefined (TypeScript error on `.path`, runtime "Cannot read properties of undefined").

- [ ] **Step 3: Add the `HandoffInfo` type and the payload field**

In `src/preview/types.ts`, add the interface above `DocPayload` and the field inside it. Replace this block:

```ts
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

with:

```ts
/** The agent-handoff pickup ticket surfaced on GET /api/doc (design 2026-06-05). */
export interface HandoffInfo {
  /** The path `markwise preview` was launched with. */
  path: string;
  /** Open notes that are the agent's turn (status.waitingOnAgent.length). */
  waitingCount: number;
  /** Ready-to-copy clipboard text built by buildHandoffText. */
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
```

- [ ] **Step 4: Compute `handoff` in `buildDocPayload`**

In `src/preview/payload.ts`, add two imports and the `handoff` field. Replace the import block and the function body.

Replace:

```ts
import { basename } from 'node:path';
import { extractNotes } from './notes.js';
import { renderDocumentHtml } from './render.js';
import type { DocPayload } from './types.js';
```

with:

```ts
import { basename } from 'node:path';
import { extractNotes } from './notes.js';
import { renderDocumentHtml } from './render.js';
import { status } from '../status.js';
import { buildHandoffText } from './handoff.js';
import type { DocPayload } from './types.js';
```

Replace:

```ts
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

with:

```ts
export function buildDocPayload(source: string, filePath: string): DocPayload {
  const open = extractNotes(source).filter((n) => n.state === 'open');
  const waitingCount = status(source).waitingOnAgent.length;
  return {
    title: firstH1(source) ?? basename(filePath),
    html: renderDocumentHtml(source),
    notes: open,
    openCount: open.length,
    handoff: {
      path: filePath,
      waitingCount,
      text: buildHandoffText({ path: filePath, waitingCount }),
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/preview/payload.test.ts test/preview/server.test.ts`
Expected: PASS (payload 6 tests, server 15 tests).

- [ ] **Step 6: Commit**

```bash
git add src/preview/types.ts src/preview/payload.ts test/preview/payload.test.ts test/preview/server.test.ts
git commit -m "Surface the agent-handoff ticket in the /api/doc payload"
```

---

### Task 3: Wire the "Hand to agent" button in the browser

This task has no JS unit-test harness in the repo (browser code is verified by build + manual/Playwright, as in M3a). Each step shows the exact edit.

**Files:**
- Modify: `src/preview/assets/index.html`
- Modify: `src/preview/assets/app.css`
- Modify: `src/preview/assets/app.js`

- [ ] **Step 1: Relabel the header button**

In `src/preview/assets/index.html`, replace:

```html
        <button type="button" class="mw-done" disabled title="Available in the next milestone">
          Done reviewing
        </button>
```

with:

```html
        <button type="button" class="mw-handoff" disabled>
          Hand to agent
        </button>
```

(It starts `disabled`; `app.js` enables it once a payload with `waitingCount > 0` loads.)

- [ ] **Step 2: Style the activated button**

In `src/preview/assets/app.css`, replace:

```css
.mw-done {
  border: 1px solid var(--mw-line);
  background: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  font: inherit;
  font-size: 14px;
  opacity: 0.5;
}
```

with:

```css
.mw-handoff {
  border: 1px solid #111;
  background: #111;
  color: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.mw-handoff:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 3: Add the button reference and handoff state in `app.js`**

In `src/preview/assets/app.js`, find:

```js
  const counterBtn = document.querySelector('.mw-counter');
  const countEl = document.querySelector('.mw-count');

  let activeId = null;
  let pendingTarget = null; // { kind:'span'|'point', start, end? } awaiting a draft
  let pillEl = null;
```

and replace it with:

```js
  const counterBtn = document.querySelector('.mw-counter');
  const countEl = document.querySelector('.mw-count');
  const handoffBtn = document.querySelector('.mw-handoff');

  let activeId = null;
  let pendingTarget = null; // { kind:'span'|'point', start, end? } awaiting a draft
  let pillEl = null;
  let handoff = null; // latest /api/doc handoff bundle { path, waitingCount, text }
```

- [ ] **Step 4: Add a `copyToClipboard` helper**

In `src/preview/assets/app.js`, immediately after the `showToast` function (the block that ends with the `}` after `window.setTimeout(... 3000);`), add:

```js
  // Resolves true if the text reached the clipboard, false otherwise. writeText is initiated
  // synchronously from the click handler (the text is already in hand), so the user-gesture
  // context is preserved across browsers.
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return false; }
      );
    }
    return Promise.resolve(false);
  }
```

- [ ] **Step 5: Wire the click handler**

In `src/preview/assets/app.js`, find:

```js
  counterBtn.addEventListener('click', function () {
    reveal(body.classList.contains('mw-clean'));
  });
```

and add directly after it:

```js
  if (handoffBtn) {
    handoffBtn.addEventListener('click', function () {
      if (!handoff || !handoff.text) return;
      copyToClipboard(handoff.text).then(function (ok) {
        showToast(
          ok
            ? 'Copied - paste into your agent to start the revision pass'
            : "Couldn't copy - check clipboard permissions"
        );
      });
    });
  }
```

- [ ] **Step 6: Update the button state on every load**

In `src/preview/assets/app.js`, find this block inside `load()`:

```js
        countEl.textContent = String(payload.openCount || 0);
        renderRail(payload.notes || []);
```

and replace it with:

```js
        countEl.textContent = String(payload.openCount || 0);
        renderRail(payload.notes || []);
        handoff = payload.handoff || null;
        if (handoffBtn) {
          var waiting = !!(handoff && handoff.waitingCount > 0);
          handoffBtn.disabled = !waiting;
          handoffBtn.title = waiting ? '' : 'No notes waiting on the agent';
        }
```

- [ ] **Step 7: Build and run the full suite**

Run: `npm run build && npm test`
Expected: build succeeds (assets copied to `dist/preview/assets/`), all tests pass (full suite, including the new handoff + payload + server tests).

- [ ] **Step 8: Manual / Playwright verification**

Verify against a real doc that has at least one note waiting on the agent (for example `playground.md`):

1. `node dist/cli.js preview playground.md` and open the printed localhost URL.
2. Confirm the header shows an enabled "Hand to agent" button (dark, clickable).
3. Click it; confirm the toast "Copied - paste into your agent to start the revision pass" appears.
4. Paste into a scratch buffer; confirm the text matches the ticket: ``A Markwise review of `playground.md` just finished. N notes are waiting on you.`` plus the ``markwise prompt playground.md`` line.
5. On a doc whose notes are all resolved (or all the reviewer's turn), confirm the button is dimmed and hovering shows the tooltip "No notes waiting on the agent".

(Optional automated check: with Playwright, grant clipboard permissions, click `.mw-handoff`, then assert `navigator.clipboard.readText()` equals `payload.handoff.text` from `/api/doc`.)

- [ ] **Step 9: Commit**

```bash
git add src/preview/assets/index.html src/preview/assets/app.css src/preview/assets/app.js
git commit -m "Browser: activate the Hand to agent button (copy handoff ticket)"
```

---

## Self-Review

**Spec coverage** (against `2026-06-05-previewer-handoff-design.md`):
- Section 4 (control: placement, label "Hand to agent", dimmed at zero waiting) -> Task 3 steps 1, 2, 6.
- Section 5 (exact clipboard payload, singular/plural, path interpolation, no em-dash/`-->`) -> Task 1.
- Section 6 (data flow: `handoff` on `/api/doc`, built from launch path + `status(src).waitingOnAgent`, no new endpoint, no write) -> Task 2.
- Section 7 (browser: render, synchronous copy on click, dimmed at zero, fresh on every `load()`) -> Task 3 steps 3-6.
- Section 8 (error handling: clipboard-blocked toast; no lint/422 path) -> Task 3 steps 4-5 (the `false` branch).
- Section 9 (testing: unit singular/plural/zero, server payload with/without waiting, browser click + toast) -> Tasks 1, 2, 3 step 8.
- Section 10 (success criteria: paste into Claude Code/Codex, run `markwise prompt`, references protocol, never restates) -> satisfied by the Task 1 text shape (no behavioral instructions).

**Placeholder scan:** none - every step has concrete code or an exact command.

**Type consistency:** `HandoffInfo { path, waitingCount, text }` defined in Task 2 (types.ts) is the same shape produced in `buildDocPayload` (Task 2, payload.ts), returned over `/api/doc`, and read in the browser as `payload.handoff` / `handoff.waitingCount` / `handoff.text` (Task 3). `buildHandoffText({ path, waitingCount })` (Task 1) is called with exactly those names in payload.ts (Task 2). The button class is `mw-handoff` in index.html (Task 3 step 1), app.css (step 2), and app.js `querySelector('.mw-handoff')` (step 3).
