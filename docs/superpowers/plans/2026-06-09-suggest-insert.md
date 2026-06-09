# suggest-insert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer propose inserting new text at a point in the document by clicking where it should go and typing it (the third and last direct-manipulation gesture: delete, replace, insert).

**Architecture:** The data model already supports insert (`NoteType` includes `insert`; the `point` anchor and `text` field exist; lint rules L121/L124/L125/L144 already enforce "insert is a point that carries text"). This feature enables it end to end: `createNote` accepts `insert`, the server allow-list accepts it, `render.ts` shows the proposed text inline at the point, CSS styles it green (mirroring the replace inline display), and the client adds a click+type in-place compose (mirroring the replace compose, minus the strike-through). Type-first: no synthetic caret in this slice.

**Tech Stack:** TypeScript (Node), vitest, markdown-it, vanilla browser JS/CSS (no framework). Spec: `docs/superpowers/specs/2026-06-09-previewer-suggest-insert-design.md`.

**Conventions for every task:**
- Type check: `npx tsc -p tsconfig.json --noEmit` (expected: no output = clean).
- One test file: `npx vitest run test/preview/<file>.test.ts`.
- Full suite: `npm test` (expected after each task: all pass).
- Per-task commit with a `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. Branch: `feat/suggest-insert` (already checked out). Stage only the files a task names - never `git add -A` (untracked `.claude/`, `markwise-pm-onboarding.md`, `markwise-user-prompts.md` must stay out).
- Live tests use a FRESH `/tmp` doc written by the step (never `sample.md`, never the gitignored `playground.md`).

---

### Task 1: `createNote` accepts an insert (point anchor, carries text)

**Files:**
- Modify: `src/preview/mutate.ts` (the `createNote` function)
- Test: `test/preview/mutate.test.ts`

The data model and lint already expect insert; this only widens `createNote`'s guards. The lint-clean test is written first to confirm the produced record satisfies lint (the spec's #1 de-risking check).

- [ ] **Step 1: Write the failing tests**

Append this block to `test/preview/mutate.test.ts` (after the `describe('createNote (replace suggestions)', ...)` block, before `describe('discardNote', ...)`). It reuses the existing `FRESH` fixture (which has a point comment `n1`, so new ids are `n2`...). The gap `FRESH.indexOf('plain text') + 'plain'.length` is a clean inter-word point that does not straddle the `n1` marker.

```ts
describe('createNote (insert suggestions)', () => {
  const at = '2026-06-09T00:00:00Z';
  const gapOf = (s: string) => s.indexOf('plain text') + 'plain'.length; // between "plain" and "text"

  it('the created insert record is self-correct: fixText changes nothing and it lints clean', async () => {
    const { fixText } = await import('../../src/fix.js');
    const { lintText } = await import('../../src/lint.js');
    const { output } = createNote(FRESH, { kind: 'point', start: gapOf(FRESH), body: '', at, type: 'insert', text: ' fresh' });
    expect(fixText(output).changes).toEqual([]);
    expect(lintText(output).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('creates an insert note at a point: carries text, point anchor, empty thread when no comment', () => {
    const { output, id } = createNote(FRESH, { kind: 'point', start: gapOf(FRESH), body: '', at, type: 'insert', text: ' fresh' });
    expect(output).toContain(`plain<!-- mw:${id} -->`);
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.type).toBe('insert');
    expect(rec.text).toBe(' fresh');
    expect(rec.state).toBe('open');
    expect(rec.disp).toBe('none');
    expect(rec.anchor.kind).toBe('point');
    expect(rec.anchor.hash).toBeUndefined();
    expect(rec.thread).toEqual([]);
  });

  it('seeds a reviewer thread message when an insert carries a comment', () => {
    const { output, id } = createNote(FRESH, { kind: 'point', start: gapOf(FRESH), body: 'add an adjective', at, type: 'insert', text: ' fresh' });
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.thread).toEqual([{ by: 'reviewer', at, body: 'add an adjective' }]);
  });

  it('rejects a span insert (an insert must be a point)', () => {
    const wStart = FRESH.indexOf('wedge');
    expect(() => createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: '', at, type: 'insert', text: 'x' })).toThrow(NoteMutationError);
  });

  it('rejects an insert with no text', () => {
    expect(() => createNote(FRESH, { kind: 'point', start: gapOf(FRESH), body: '', at, type: 'insert' })).toThrow(NoteMutationError);
  });

  it('rejects an insert whose text is only whitespace', () => {
    expect(() => createNote(FRESH, { kind: 'point', start: gapOf(FRESH), body: '', at, type: 'insert', text: '   ' })).toThrow(NoteMutationError);
  });

  it('stores the inserted text as typed, preserving surrounding spaces', () => {
    const { output, id } = createNote(FRESH, { kind: 'point', start: gapOf(FRESH), body: '', at, type: 'insert', text: ' spaced ' });
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.text).toBe(' spaced ');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: FAIL in the new block. Reasons (vitest runs via esbuild, which strips types without checking, so these fail at runtime): the self-correct/lint test fails because the current code stores no `text` for insert, so lint L124 flags "insert note must carry a text value"; the "carries text" test fails for the same missing-text reason; the "rejects a span insert" / "rejects no text" / "rejects whitespace text" tests fail because no guard rejects them yet (the note is created instead of throwing).

- [ ] **Step 3: Implement the three `createNote` changes**

In `src/preview/mutate.ts`, in `createNote`:

(a) Widen the `type` parameter union. Change:
```ts
    type?: 'comment' | 'delete' | 'replace';
```
to:
```ts
    type?: 'comment' | 'insert' | 'delete' | 'replace';
```

(b) Add an insert-must-be-point guard. Immediately after the existing delete/replace span guard:
```ts
  if ((type === 'delete' || type === 'replace') && opts.kind !== 'span') {
    throw new NoteMutationError(`a ${type} suggestion must wrap a span`, 400);
  }
```
add:
```ts
  if (type === 'insert' && opts.kind !== 'point') {
    throw new NoteMutationError('an insert suggestion must be a point', 400);
  }
```

(c) Require and store `text` for insert as well as replace. Change the text-required check:
```ts
  if (type === 'replace' && (typeof opts.text !== 'string' || opts.text.trim() === '')) {
    throw new NoteMutationError('a replace suggestion needs replacement text', 400);
  }
```
to:
```ts
  if ((type === 'replace' || type === 'insert') && (typeof opts.text !== 'string' || opts.text.trim() === '')) {
    throw new NoteMutationError(`a ${type} suggestion needs text`, 400);
  }
```
and change the record's text spread:
```ts
    ...(type === 'replace' ? { text: opts.text } : {}),
```
to:
```ts
    ...(type === 'replace' || type === 'insert' ? { text: opts.text } : {}),
```

Also update the nearby explanatory comment so it stays accurate - change the line that reads `// A comment's intent lives in its body, so it is required. A delete/replace's intent is the wrapped` and its continuation to mention insert, e.g. note that an insert's intent is its point plus the proposed `text`, so its comment is optional too (D27/D42).

- [ ] **Step 4: Run the tests and type check to verify they pass**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: PASS (all insert tests green; the existing comment/delete/replace tests still green).
Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no output (the widened union makes the tests' `type: 'insert'` type-valid).

- [ ] **Step 5: Commit**

```bash
git add src/preview/mutate.ts test/preview/mutate.test.ts
git commit -m "$(cat <<'EOF'
feat(suggest-insert): createNote accepts an insert (point + text)

Widen the type union to include insert, require it to be a point, and
store its proposed text - mirroring replace. Lint (L124/L144) already
enforces this shape; a lint-clean guard test confirms the record.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Server `POST /api/note` accepts an insert

**Files:**
- Modify: `src/preview/server.ts` (the `POST /api/note` handler)
- Test: `test/preview/server.test.ts`

There is an existing test named `'rejects an unsupported type (400)'` that posts `{ type: 'insert', kind: 'span' }`. After this change insert IS supported, but a *span* insert is still rejected (insert must be a point), so that exact post still returns 400 for a new reason. This task repurposes that test to use a genuinely unknown type, and adds an insert-endpoints block.

- [ ] **Step 1: Write/adjust the failing tests**

(a) In `test/preview/server.test.ts`, replace the existing test:
```ts
  it('rejects an unsupported type (400)', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { type: 'insert', kind: 'span', start: 3, end: 8, body: 'x' });
    expect(res.status).toBe(400);
  });
```
with:
```ts
  it('rejects an unknown note type (400)', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { type: 'frobnicate', kind: 'span', start: 3, end: 8, body: 'x' });
    expect(res.status).toBe(400);
  });
```

(b) Append a new describe block after `describe('suggest-replace endpoints', ...)`:
```ts
describe('suggest-insert endpoints', () => {
  it('creates an insert suggestion at a point, carrying the typed text', async () => {
    const base = await start(DOC);
    const gap = DOC.indexOf('by'); // a clean inter-word gap, not inside the s1 span
    const res = await post(base, '/api/note', { type: 'insert', kind: 'point', start: gap, text: 'soon ' });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.createdId).toBe('n1');
    const note = payload.notes.find((n: { id: string }) => n.id === 'n1');
    expect(note.type).toBe('insert');
    expect(note.text).toBe('soon ');
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).toContain('"type":"insert"');
    expect(onDisk).toContain('"text":"soon "');
    expect(/"kind":"point"/.test(onDisk)).toBe(true);
  });

  it('rejects a span insert (400) and leaves the file byte-identical', async () => {
    const base = await start(DOC);
    const before = readFileSync(join(dir!, 'demo.md'), 'utf8');
    const wStart = DOC.indexOf('Ships');
    const res = await post(base, '/api/note', { type: 'insert', kind: 'span', start: wStart, end: wStart + 5, text: 'x' });
    expect(res.status).toBe(400);
    expect(readFileSync(join(dir!, 'demo.md'), 'utf8')).toBe(before);
  });

  it('rejects an insert with no text (400)', async () => {
    const base = await start(DOC);
    const gap = DOC.indexOf('by');
    const res = await post(base, '/api/note', { type: 'insert', kind: 'point', start: gap });
    expect(res.status).toBe(400);
  });

  it('discards an insert suggestion, removing marker and record (generic discardNote)', async () => {
    const base = await start(DOC);
    const gap = DOC.indexOf('by');
    await post(base, '/api/note', { type: 'insert', kind: 'point', start: gap, text: 'soon ' });
    const res = await post(base, '/api/note/n1/discard');
    expect(res.status).toBe(200);
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).not.toContain('mw:n1');
    expect(onDisk).not.toContain('"text":"soon "');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/server.test.ts`
Expected: FAIL in the new `suggest-insert endpoints` block - the create-insert and discard-insert tests fail because the handler currently rejects `type: 'insert'` with 400 (so `createdId` is absent and status is 400, not 200). The renamed unknown-type test passes. (The "rejects a span insert" and "rejects no text" tests already pass, since insert is currently rejected outright - they will still pass after the change for the correct post-change reasons.)

- [ ] **Step 3: Implement the server change**

In `src/preview/server.ts`, in the `POST /api/note` handler, change:
```ts
          const rawType = isObj(parsed) && typeof parsed.type === 'string' ? parsed.type : 'comment';
          if (rawType !== 'comment' && rawType !== 'delete' && rawType !== 'replace') {
            throw new NoteMutationError('type must be "comment", "delete", or "replace"', 400);
          }
          const type: 'comment' | 'delete' | 'replace' = rawType;
```
to:
```ts
          const rawType = isObj(parsed) && typeof parsed.type === 'string' ? parsed.type : 'comment';
          if (rawType !== 'comment' && rawType !== 'insert' && rawType !== 'delete' && rawType !== 'replace') {
            throw new NoteMutationError('type must be "comment", "insert", "delete", or "replace"', 400);
          }
          const type: 'comment' | 'insert' | 'delete' | 'replace' = rawType;
```

- [ ] **Step 4: Run the tests and type check to verify they pass**

Run: `npx vitest run test/preview/server.test.ts`
Expected: PASS (all server tests green).
Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/preview/server.ts test/preview/server.test.ts
git commit -m "$(cat <<'EOF'
feat(suggest-insert): accept insert on POST /api/note

Add insert to the type allow-list (a span insert is still rejected by
createNote: insert must be a point). Repurpose the unsupported-type test
to a genuinely unknown type.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Render a committed insert's text inline

**Files:**
- Modify: `src/preview/render.ts` (the `convertMarker` point branch)
- Test: `test/preview/render.test.ts`

The render fixture `DOC` already has an open insert note `s2` (`text: " More."`). One existing test asserts the *current* empty span and must be updated; two tests are added.

- [ ] **Step 1: Update and add the failing tests**

(a) In `test/preview/render.test.ts`, replace the existing test:
```ts
  it('renders an open point note as a self-closing typed span', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<span class="mw-point mw-type-insert" data-mw-id="s2"></span>');
  });
```
with:
```ts
  it('renders a committed insert with its proposed text inside the point span', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<span class="mw-point mw-type-insert" data-mw-id="s2"> More.</span>');
  });

  it('renders a point comment as an empty point span (no inserted text)', () => {
    const src = [
      '# T',
      '',
      'Done.<!-- mw:p1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"hi"}]}',
      '-->',
      '',
    ].join('\n');
    expect(renderDocumentHtml(src)).toContain('<span class="mw-point mw-type-comment" data-mw-id="p1"></span>');
  });

  it('HTML-escapes the inserted text', () => {
    const src = [
      '# T',
      '',
      'Use it.<!-- mw:i1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"i1","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"it.","after":""},"text":" a < b & c","thread":[]}',
      '-->',
      '',
    ].join('\n');
    const html = renderDocumentHtml(src);
    expect(html).toContain('<span class="mw-point mw-type-insert" data-mw-id="i1"> a &lt; b &amp; c</span>');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/render.test.ts`
Expected: FAIL - the "text inside the point span" and "HTML-escapes" tests fail because the current point branch emits an empty `</span>` with no inner text. (The "point comment empty span" test already passes - a comment point stays empty - and must keep passing after the change.)

- [ ] **Step 3: Implement the render change**

In `src/preview/render.ts`, in `convertMarker`, change the point branch:
```ts
  if (note.anchorKind === 'point') {
    return `<span class="mw-point ${typeClass}" data-mw-id="${escapeAttr(id)}"></span>`;
  }
```
to:
```ts
  if (note.anchorKind === 'point') {
    // A committed insert shows its proposed text inside the point span (spec
    // 2026-06-09-previewer-suggest-insert). The text lives in the note record, not the prose; it is
    // escaped as content and hidden in clean read mode by the existing `.mw-clean .mw-point` rule.
    // A point comment stays empty (its pillar marker). Single span (no nested/sibling span): an
    // insert point has only the inserted text, and it shares the span's data-mw-id for free activation.
    const inner = note.type === 'insert' && note.text ? md.utils.escapeHtml(note.text) : '';
    return `<span class="mw-point ${typeClass}" data-mw-id="${escapeAttr(id)}">${inner}</span>`;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/preview/render.test.ts`
Expected: PASS (incl. the unchanged replace-inline tests, whose `mw-replace-text` count stays 1 - an insert adds no `mw-replace-text`).
Run: `npm test`
Expected: the full suite passes (confirms `payload.test.ts`, whose insert note is `resolved` and so is filtered out of render, and `notes.test.ts`, which tests the untouched extract layer, are unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/preview/render.ts test/preview/render.test.ts
git commit -m "$(cat <<'EOF'
feat(suggest-insert): render a committed insert's text inline

The point branch emits the proposed text inside the insert point span
(escaped, hidden in clean mode by the existing .mw-clean .mw-point rule),
mirroring the replace inline display. Point comments stay empty.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Style the committed insert and the compose field

**Files:**
- Modify: `src/preview/assets/app.css`

No unit test (CSS). Verified live, using a hand-authored `/tmp` doc that already contains an open insert record - render (Task 3) emits the right HTML, so the committed look is verifiable before the client gesture exists. The compose-field style (`.mw-insert-field`) is added here but exercised in Task 5.

- [ ] **Step 1: Scope the green pillar to point comments**

In `src/preview/assets/app.css`, change the pillar rule selector. Change:
```css
.mw-revealed .mw-point {
```
to:
```css
.mw-revealed .mw-point.mw-type-comment {
```
and change its active-state rule:
```css
.mw-revealed .mw-point.active { outline: 2px solid var(--mw-insert); outline-offset: 1px; }
```
to:
```css
.mw-revealed .mw-point.mw-type-comment.active { outline: 2px solid var(--mw-insert); outline-offset: 1px; }
```
(The only point types are comment and insert - delete/replace are span-only - so scoping to comment is exact. An insert point gets its own style below; nothing else styles it except the existing `.mw-clean .mw-point { display: none }`, which correctly hides it in clean mode.)

- [ ] **Step 2: Style the committed inserted text**

Add, right after the pillar rule block (and before the `/* Active note */` comment):
```css
/* Committed insert: the proposed text, rendered inline at the point (spec
   2026-06-09-previewer-suggest-insert). Hidden in clean read mode via .mw-clean .mw-point so the
   reading column equals the file. Green tint + underline (the insert color), echoing the compose
   field; --mw-insert is saturated, so the tint is derived with color-mix (as the pillar halo is). */
.mw-revealed .mw-point.mw-type-insert {
  background: color-mix(in srgb, var(--mw-insert) 18%, transparent);
  color: var(--mw-ink);
  text-decoration: underline;
  text-decoration-color: var(--mw-insert);
  border-radius: 3px;
  padding: 0 2px;
  cursor: pointer;
}
.mw-revealed .mw-point.mw-type-insert.active {
  background: color-mix(in srgb, var(--mw-insert) 30%, transparent);
}
```

- [ ] **Step 3: Add the inserted text to the active-highlight transition**

Change:
```css
.mw-span, .mw-replace-text { transition: background-color 180ms ease; }
```
to:
```css
.mw-span, .mw-replace-text, .mw-point.mw-type-insert { transition: background-color 180ms ease; }
```

- [ ] **Step 4: Add the compose field style**

After the `.mw-replace-field { ... }` block, add (mirrors replace-field in the insert color; no `margin-left` because an insert sits mid-flow at the caret, not after a struck word):
```css
.mw-insert-field {
  outline: none;
  background: color-mix(in srgb, var(--mw-insert) 18%, transparent);
  color: var(--mw-ink);
  border-radius: 3px;
  padding: 0 2px;
  box-shadow: inset 0 -2px 0 var(--mw-insert);
  white-space: pre-wrap;
}
```

- [ ] **Step 5: Build and verify the committed look live (all three themes)**

```bash
npm run build
cat > /tmp/mw-insert-css.md <<'EOF'
# Insert styling check

The product ships next year.<!-- mw:i1 --> The market is large.

<!-- mw:log v=1
{"id":"i1","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"next year.","after":" The"},"text":" (Q4 at the latest)","thread":[{"by":"reviewer","at":"2026-06-09T00:00:00Z","body":"give a concrete date"}]}
-->
EOF
node dist/cli.js preview /tmp/mw-insert-css.md
```
Then drive the preview (Playwright MCP, or open the printed URL). Verify:
- In revealed mode, the text `(Q4 at the latest)` shows inline right after "next year." with a green tint + green underline (not a 4px pillar).
- Click the inserted text (or its rail card): both deepen together (active state).
- Toggle to clean read mode: the inserted text disappears and the line reads "The product ships next year. The market is large." (the pure file).
- Toggle back: it returns.
- Switch Dark / Light / Sepia (the theme picker): the green tint and underline are legible in all three.
- The document still lints clean: `node dist/cli.js lint /tmp/mw-insert-css.md` (expected: no errors).

- [ ] **Step 6: Commit**

```bash
git add src/preview/assets/app.css
git commit -m "$(cat <<'EOF'
feat(suggest-insert): style the committed insert and compose field

Scope the green pillar to point comments; style an insert point's inline
text (green tint + underline, hidden in clean mode) and the compose field,
mirroring the replace inline display in the insert color.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Client gesture and in-place compose (click + type)

**Files:**
- Modify: `src/preview/assets/app.js`

No unit test (vanilla browser JS, verified live like delete/replace). This adds the collapsed-caret point target, the in-place insert compose (mirroring the replace compose minus the strike-through), wiring into the printable-key and click-away handlers, the discard control on insert cards, and the empty-rail hint.

- [ ] **Step 1: Add the insert compose state and helpers**

In `src/preview/assets/app.js`, add a module-level state variable next to `replaceCompose` (near the top, after `let replaceCompose = null;`):
```js
  let insertCompose = null; // { fieldEl, target } while typing an insertion in place
```

Add `pointTargetFromCaret` right after the `spanTargetFromSelection` function:
```js
  // Read a collapsed caret into a point insert target, or null if there is no caret or it does not
  // map to a breadcrumb run. The collapsed-selection counterpart of spanTargetFromSelection; drives
  // the click+type insert gesture. A click in read-only-but-selectable prose leaves a collapsed
  // caret in the clicked text node, which no handler clears, so it survives to the keydown.
  function pointTargetFromCaret() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    var range = sel.getRangeAt(0);
    var off = srcOffset(range.startContainer, range.startOffset);
    if (off == null) return null;
    return { kind: 'point', start: off };
  }
```

Add the compose functions right after `cancelReplace` (so the insert compose sits beside the replace compose it mirrors):
```js
  // Click a point and type to propose an insertion (Google-Docs Suggesting mode): an inline editable
  // field opens at the caret, seeded with the typed character. Unlike replace there is no original to
  // strike; committing stores the text as an insert note at that point. The field is transient -
  // load() repaints from the server on commit/cancel, so it never persists.
  function startInsert(target, seed) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0).cloneRange();
    if (body.classList.contains('mw-clean')) reveal(true);
    clearPill();

    var field = document.createElement('span');
    field.className = 'mw-insert-field';
    field.setAttribute('contenteditable', 'true');
    field.textContent = seed;
    // Insert at the caret. Inside a text node this splits the node and places the field between the
    // halves, so it appears exactly at the insertion point inside the surrounding breadcrumb run.
    range.insertNode(field);
    insertCompose = { fieldEl: field, target: target };

    field.focus();
    var r = document.createRange();
    r.selectNodeContents(field);
    r.collapse(false); // caret to the end of the seed character
    sel.removeAllRanges();
    sel.addRange(r);

    field.addEventListener('keydown', onInsertFieldKey);
  }

  function onInsertFieldKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitInsert(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelInsert(); }
  }

  // Commit the in-place insertion: POST an insert note carrying the typed text, then load() repaints
  // (the text renders inline at the point, a card appears) and wipes the transient field. An
  // empty/whitespace field is a cancel.
  function commitInsert() {
    if (!insertCompose) return;
    var c = insertCompose;
    var text = c.fieldEl.textContent;
    if (!text || text.trim() === '') { cancelInsert(); return; }
    insertCompose = null; // prevent re-entry; load()/catch handles the transient DOM
    createInsert(c.target, text);
  }

  function createInsert(target, text) {
    fetch('/api/note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'insert', kind: 'point', start: target.start, text: text }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Insert failed'); });
        return r.json();
      })
      .then(function (data) {
        if (data && data.createdId) activeId = data.createdId;
        return load();
      })
      .catch(function (err) { showToast(err.message || 'Insert failed'); return load(); });
  }

  // Cancel the in-place insertion: remove the field and repaint from the server, which restores the
  // breadcrumb run that range.insertNode split when the field was placed.
  function cancelInsert() {
    if (!insertCompose) return;
    var c = insertCompose;
    insertCompose = null;
    c.fieldEl.removeEventListener('keydown', onInsertFieldKey);
    if (c.fieldEl.parentNode) c.fieldEl.parentNode.removeChild(c.fieldEl);
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    load(); // the field split a text node; repaint to restore pristine breadcrumbs
  }
```

- [ ] **Step 2: Wire the printable-key handler to start an insert from a collapsed caret**

Change the existing printable-character keydown handler:
```js
  document.addEventListener('keydown', function (e) {
    if (replaceCompose) return;
    if (e.key == null || e.key.length !== 1) return; // printable single char only (not Enter/Tab/etc.)
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // let Cmd+C / Ctrl+A / etc. pass through
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return;
    var target = spanTargetFromSelection();
    if (!target) return; // collapsed or non-mappable selection: the key no-ops
    e.preventDefault();
    startReplace(target, e.key);
  });
```
to:
```js
  document.addEventListener('keydown', function (e) {
    if (replaceCompose || insertCompose) return;
    if (e.key == null || e.key.length !== 1) return; // printable single char only (not Enter/Tab/etc.)
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // let Cmd+C / Ctrl+A / etc. pass through
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return;
    var span = spanTargetFromSelection();
    if (span) { e.preventDefault(); startReplace(span, e.key); return; } // non-collapsed selection -> replace
    var point = pointTargetFromCaret();
    if (!point) return; // no mappable caret: the key no-ops
    e.preventDefault();
    startInsert(point, e.key); // collapsed caret -> insert
  });
```

- [ ] **Step 3: Wire click-away to commit an open insert**

After the existing replace click-away handler:
```js
  document.addEventListener('mousedown', function (e) {
    if (replaceCompose && e.target !== replaceCompose.fieldEl && !replaceCompose.fieldEl.contains(e.target)) {
      commitReplace();
    }
  });
```
add:
```js
  document.addEventListener('mousedown', function (e) {
    if (insertCompose && e.target !== insertCompose.fieldEl && !insertCompose.fieldEl.contains(e.target)) {
      commitInsert();
    }
  });
```

- [ ] **Step 4: Show the discard control on insert cards and update the empty-rail hint**

In `renderRail`, change the discard-button condition:
```js
      if (note.type === 'delete' || note.type === 'replace') {
```
to:
```js
      if (note.type === 'delete' || note.type === 'replace' || note.type === 'insert') {
```

Change the empty-rail hint:
```js
      empty.textContent = 'Select text to comment, or press Delete to suggest a deletion.';
```
to:
```js
      empty.textContent = 'Select text to comment, press Delete to suggest a deletion, or click and type to suggest an insertion.';
```

- [ ] **Step 5: Build and verify the full gesture live (all three themes)**

```bash
npm run build
cat > /tmp/mw-insert-flow.md <<'EOF'
# Insert flow check

The product ships next year. The market is large and growing.
EOF
node dist/cli.js preview /tmp/mw-insert-flow.md
```
Drive the preview (Playwright MCP, or the printed URL). Verify:
- Click between "ships" and "next", type `very soon ` -> a green compose field appears at the caret holding the typed text.
- Press Enter -> the field is replaced by inline green text `very soon ` at that point, and a rail card titled "insert" with the snippet appears; the open count increments.
- The on-disk file gained a single `<!-- mw:n1 -->` marker and an insert log record with the text, and the prose is otherwise unchanged: `cat /tmp/mw-insert-flow.md`.
- Toggle to clean: the inserted text is gone; toggle back: it returns.
- Click the inserted text and the card: they highlight together.
- The card's × opens the discard confirm; Remove -> the marker and record are gone and the line reads as before.
- Start another insert and press Esc mid-type -> the field disappears and the prose is pristine (no split text, no leftover field).
- Click-away (mousedown elsewhere) while composing -> commits (an empty field cancels).
- Repeat a spot check in Dark / Light / Sepia.
- `node dist/cli.js lint /tmp/mw-insert-flow.md` after a commit -> no errors.

- [ ] **Step 6: Commit**

```bash
git add src/preview/assets/app.js
git commit -m "$(cat <<'EOF'
feat(suggest-insert): click+type in-place insert compose

Add the collapsed-caret point target and an in-place insert compose
(mirroring replace, minus the strike-through): click to place a point,
type to open a green field, Enter/click-away commits, Esc/empty cancels.
Insert cards get the discard control; the empty-rail hint mentions it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm test` -> full suite green.
- [ ] `npx tsc -p tsconfig.json --noEmit` -> clean.
- [ ] One end-to-end live pass on a fresh `/tmp` doc across Dark/Light/Sepia: create an insert, toggle clean/revealed, activate from both ends, discard, and Esc-cancel; confirm the file lints clean and the prose is only ever touched by the zero-width marker.
- [ ] The three gestures now coexist without interference: drag-select + Delete (delete), select + type (replace), click + type (insert), double-click gap (point comment).
