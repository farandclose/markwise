# Suggest-replace (Op 1: mouse-select + type) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer propose replacing a phrase by selecting it with the mouse and typing the replacement: the original renders struck-through while the new text is typed inline right after it (Google Docs Suggesting mode), Enter (or click-away) commits a `replace` note carrying the typed text, and the original stays in the file for the agent to substitute.

**Architecture:** Pure string transforms in `src/preview/mutate.ts` (extend `createNote` for `type:'replace'` + a `text` field) flow through the existing lint-gated `persist()` path in `src/preview/server.ts` (widen `POST /api/note` to accept `replace` + `text`). The browser (`src/preview/assets/app.js`) adds a printable-key `keydown` trigger that reuses the existing `spanTargetFromSelection()` mapping, builds a transient in-place compose (struck-through target span + inline `contenteditable` field), and POSTs `{type:'replace', kind:'span', start, end, text}`; the replace card reuses the existing × discard. `discardNote` is already generic and needs no change. No new protocol; the `mw-type-replace` render style already exists (`app.css:324`).

**Tech Stack:** TypeScript (Node http server, no framework), Vitest, vanilla browser JS/CSS. Markdown-it rendering with offset breadcrumbs already in place.

**Spec:** `docs/superpowers/specs/2026-06-08-previewer-suggest-replace-design.md`. Branch: `feat/suggest-replace`.

---

## File Structure

- **Modify** `src/preview/mutate.ts` — extend `createNote` to author `replace` (add `type:'replace'` to the union, an optional `text` param, the span-required + non-empty-text guards, and the `text` field on the record).
- **Modify** `src/preview/server.ts` — `POST /api/note` accepts `type:'replace'` and reads `text`.
- **Modify** `src/preview/assets/app.js` — printable-key replace trigger; in-place compose (wrap target, inline field, commit/cancel); `createReplace()`; extend the × discard to replace cards.
- **Modify** `src/preview/assets/app.css` — styling for `.mw-replace-target` and `.mw-replace-field`.
- **Modify** `test/preview/mutate.test.ts` — replace-variant `createNote` tests.
- **Modify** `test/preview/server.test.ts` — replace-create + replace-discard endpoint tests; fix the existing "unsupported type" test to use `insert`.

No `DECISIONS.md` change: **D42 already names `replace`** ("the previewer lets a reviewer originate `delete` (first slice) and later `insert`/`replace` suggestions"), so the decision log already covers this slice.

Order: transform → server → client → full verification. Server tests depend on Task 1; client depends on Task 2.

---

## Task 1: `createNote` replace variant

**Files:**
- Modify: `src/preview/mutate.ts:195-255` (the `createNote` function)
- Test: `test/preview/mutate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this block to `test/preview/mutate.test.ts` (after the `describe('discardNote', ...)` block, at the end of the file). It reuses the existing `FRESH` fixture (line 222) and the imported `NoteMutationError`.

```typescript
describe('createNote (replace suggestions)', () => {
  const at = '2026-06-08T00:00:00Z';

  it('creates a replace note over a span: carries text, empty thread when no comment', () => {
    const wStart = FRESH.indexOf('wedge');
    const { output, id } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: '', at, type: 'replace', text: 'niche' });
    expect(output).toContain(`<!-- mw:${id} -->wedge<!-- /mw:${id} -->`);
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.type).toBe('replace');
    expect(rec.text).toBe('niche');
    expect(rec.state).toBe('open');
    expect(rec.disp).toBe('none');
    expect(rec.anchor.kind).toBe('span');
    expect(typeof rec.anchor.hash).toBe('string');
    expect(rec.thread).toEqual([]);
  });

  it('seeds a reviewer thread message when a replace carries a comment', () => {
    const wStart = FRESH.indexOf('wedge');
    const { output, id } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: 'clearer word', at, type: 'replace', text: 'niche' });
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.thread).toEqual([{ by: 'reviewer', at, body: 'clearer word' }]);
  });

  it('rejects a replace with no replacement text', () => {
    const wStart = FRESH.indexOf('wedge');
    expect(() => createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: '', at, type: 'replace' })).toThrow(NoteMutationError);
  });

  it('rejects a replace whose replacement text is only whitespace', () => {
    const wStart = FRESH.indexOf('wedge');
    expect(() => createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: '', at, type: 'replace', text: '   ' })).toThrow(NoteMutationError);
  });

  it('rejects a point replace (a replace must wrap a span)', () => {
    expect(() => createNote(FRESH, { kind: 'point', start: 5, body: '', at, type: 'replace', text: 'x' })).toThrow(NoteMutationError);
  });

  it('stores the replacement text as typed, preserving surrounding spaces', () => {
    const wStart = FRESH.indexOf('wedge');
    const { output, id } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: '', at, type: 'replace', text: ' spaced ' });
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.text).toBe(' spaced ');
  });

  it('the created replace record is self-correct: fixText changes nothing and it lints clean', async () => {
    const { fixText } = await import('../../src/fix.js');
    const { lintText } = await import('../../src/lint.js');
    const wStart = FRESH.indexOf('wedge');
    const { output } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: '', at, type: 'replace', text: 'niche' });
    expect(fixText(output).changes).toEqual([]);
    expect(lintText(output).filter((f) => f.severity === 'error')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: the new replace tests FAIL at runtime (Vitest transpiles via esbuild and does not type-check, so the extra `type`/`text` opts run). The current `createNote` ignores `text` and only enforces the span rule for `delete`, so: the happy-path test fails (`rec.text` is `undefined`, not `'niche'`), the "no text" / "whitespace text" / "point replace" tests fail (no throw). Existing tests stay green.

- [ ] **Step 3: Implement — replace the `createNote` function**

Replace the whole `createNote` function (`src/preview/mutate.ts`, currently lines 195-255) with this version. Changes vs. the current code: the `type` union gains `'replace'`; a new optional `text` param; the span-required guard now covers `delete` **and** `replace`; a new non-empty-`text` guard for `replace`; and the record carries `text` for a replace (inserted between `anchor` and `thread`, matching the canonical record shape).

```typescript
export function createNote(
  source: string,
  opts: {
    kind: 'point' | 'span';
    start: number;
    end?: number;
    body: string;
    at: string;
    type?: 'comment' | 'delete' | 'replace';
    text?: string;
  }
): { output: string; id: string } {
  const type = opts.type ?? 'comment';
  const body = opts.body.trim();
  // A comment's intent lives in its body, so it is required. A delete/replace's intent is the wrapped
  // span (plus, for replace, the proposed text), so the comment is optional (D27/D42); an empty body
  // yields an empty thread.
  if (type === 'comment' && body === '') throw new NoteMutationError('comment body is empty', 400);
  if ((type === 'delete' || type === 'replace') && opts.kind !== 'span') {
    throw new NoteMutationError(`a ${type} suggestion must wrap a span`, 400);
  }
  // A replace carries the proposed replacement text (L124: text present iff insert/replace). It is
  // stored as typed (not trimmed) so intentional surrounding spaces survive; only whitespace-only
  // (or missing) text is rejected.
  if (type === 'replace' && (typeof opts.text !== 'string' || opts.text.trim() === '')) {
    throw new NoteMutationError('a replace suggestion needs replacement text', 400);
  }
  const { kind, start } = opts;
  if (!Number.isInteger(start) || start < 0 || start > source.length) {
    throw new NoteMutationError('selection start out of range', 400);
  }
  const end = opts.end;
  if (kind === 'span' && (!Number.isInteger(end) || end! <= start || end! > source.length)) {
    throw new NoteMutationError('selection end out of range', 400);
  }
  // All inputs validated; now do the work (mintId parses the whole document).
  const id = mintId(source);
  const before = stripMarkers(source.slice(0, start)).slice(-CONTEXT_WINDOW);
  const open = `<!-- mw:${id} -->`;

  let withMarkers: string;
  let anchor: Record<string, unknown>;
  if (kind === 'span') {
    const wrapped = source.slice(start, end!);
    // Refuse a selection that straddles an existing marker: wrapping it would interleave fences,
    // which lint does not catch for comment notes.
    if (stripMarkers(wrapped) !== wrapped) {
      throw new NoteMutationError('selection would wrap an existing note marker', 400);
    }
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
    type,
    state: 'open',
    disp: 'none',
    anchor,
    ...(type === 'replace' ? { text: opts.text } : {}),
    thread: body === '' ? [] : [{ by: 'reviewer', at: opts.at, body }],
  };
  return { output: insertLogRecord(withMarkers, JSON.stringify(record)), id };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: PASS — the new replace tests plus all existing `createNote` / `createNote (delete suggestions)` / `discardNote` / `resolveNote` / `appendReply` tests (no regression; comment and delete authoring is byte-identical because the new branches only fire for `type:'replace'`).

- [ ] **Step 5: Commit**

```bash
git add src/preview/mutate.ts test/preview/mutate.test.ts
git commit -m "$(cat <<'EOF'
feat(mutate): createNote can author a replace suggestion

Adds type:'replace' with a required, non-empty text (the proposed
replacement) over a span; the comment stays optional (empty thread when
none). The original text is wrapped, not changed - the agent substitutes
it later. Comment/delete authoring is unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Server — `type:'replace'` + `text` on create

**Files:**
- Modify: `src/preview/server.ts:118-132` (`POST /api/note`)
- Test: `test/preview/server.test.ts`

- [ ] **Step 1: Write the failing tests + fix the stale "unsupported type" test**

First, in `test/preview/server.test.ts`, **change the existing** `rejects an unsupported type (400)` test (lines 219-223) so its example is a type that is still unsupported this slice. With `replace` now supported, `type:'replace'` would no longer be rejected as an unsupported type (it would be rejected only for missing text, passing the assertion for the wrong reason). Use `insert`:

```typescript
  it('rejects an unsupported type (400)', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { type: 'insert', kind: 'span', start: 3, end: 8, body: 'x' });
    expect(res.status).toBe(400);
  });
```

Then append this block to `test/preview/server.test.ts` (after the `describe('suggest-delete endpoints', ...)` block, at the end of the file). It reuses the existing `start` / `post` helpers, the `DOC` fixture, and `dir` / `readFileSync` / `join`.

```typescript
describe('suggest-replace endpoints', () => {
  it('creates a replace suggestion over a span, carrying the typed text', async () => {
    const base = await start(DOC);
    const wStart = DOC.indexOf('Ships');
    const res = await post(base, '/api/note', { type: 'replace', kind: 'span', start: wStart, end: wStart + 5, text: 'Sells' });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.createdId).toBe('n1');
    const note = payload.notes.find((n: { id: string }) => n.id === 'n1');
    expect(note.type).toBe('replace');
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).toContain('<!-- mw:n1 -->Ships<!-- /mw:n1 -->'); // original stays; it is a suggestion
    expect(onDisk).toContain('"type":"replace"');
    expect(onDisk).toContain('"text":"Sells"');
  });

  it('rejects a replace with no text (400) and leaves the file byte-identical', async () => {
    const base = await start(DOC);
    const before = readFileSync(join(dir!, 'demo.md'), 'utf8');
    const wStart = DOC.indexOf('Ships');
    const res = await post(base, '/api/note', { type: 'replace', kind: 'span', start: wStart, end: wStart + 5 });
    expect(res.status).toBe(400);
    expect(readFileSync(join(dir!, 'demo.md'), 'utf8')).toBe(before);
  });

  it('rejects a point replace (400)', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { type: 'replace', kind: 'point', start: 3, text: 'x' });
    expect(res.status).toBe(400);
  });

  it('discards a replace suggestion, restoring the original prose (generic discardNote)', async () => {
    const base = await start(DOC);
    const wStart = DOC.indexOf('Ships');
    await post(base, '/api/note', { type: 'replace', kind: 'span', start: wStart, end: wStart + 5, text: 'Sells' });
    const res = await post(base, '/api/note/n1/discard');
    expect(res.status).toBe(200);
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).not.toContain('mw:n1');
    expect(onDisk).not.toContain('"text":"Sells"');
    expect(onDisk).toContain('Ships'); // original restored
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/server.test.ts`
Expected: the create-replace and point-replace tests FAIL — the server still rejects `type:'replace'` with a 400 (`type must be "comment" or "delete"`), so the create test gets 400 not 200, and the discard-after-create test fails because the create never happened. The "no text" test happens to pass (400 either way), and the edited "unsupported type" (`insert`) test passes.

- [ ] **Step 3: Implement — accept `type:'replace'` and read `text`**

In `src/preview/server.ts`, the `POST /api/note` handler currently narrows `rawType` to `'comment' | 'delete'` (lines 118-122) and never reads `text`. Make these three edits inside that handler.

Change lines 119-122 from:

```typescript
          if (rawType !== 'comment' && rawType !== 'delete') {
            throw new NoteMutationError('type must be "comment" or "delete"', 400);
          }
          const type: 'comment' | 'delete' = rawType;
```

to:

```typescript
          if (rawType !== 'comment' && rawType !== 'delete' && rawType !== 'replace') {
            throw new NoteMutationError('type must be "comment", "delete", or "replace"', 400);
          }
          const type: 'comment' | 'delete' | 'replace' = rawType;
```

Then add a `text` read immediately after the `body` line (line 125 `const body = ...`):

```typescript
          const text = isObj(parsed) && typeof parsed.text === 'string' ? parsed.text : undefined;
```

Then pass `text` into `createNote` — change the call (line 129) from:

```typescript
            const r = createNote(src, { kind, start, end, body, at: now, type });
```

to:

```typescript
            const r = createNote(src, { kind, start, end, body, at: now, type, text });
```

`createNote` is the validation boundary (it throws 400 for a `replace` with missing/whitespace `text` or a `point` kind), mirroring how `kind`/`type` are already handled.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/preview/server.test.ts`
Expected: PASS (new replace tests + the edited unsupported-type test + all existing comment/delete/reply/resolve/discard tests; comment creation still defaults to `type:'comment'`).

- [ ] **Step 5: Commit**

```bash
git add src/preview/server.ts test/preview/server.test.ts
git commit -m "$(cat <<'EOF'
feat(server): accept type:'replace' + text on /api/note

Widens the create route's type allow-list to include replace and forwards
the proposed replacement text to createNote (which validates it). Updates
the unsupported-type test to use 'insert' now that replace is supported.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Client — replace gesture, in-place compose, card discard

**Files:**
- Modify: `src/preview/assets/app.js` (state var; extend × to replace cards; compose helpers + `createReplace`; printable-key trigger + click-away commit)
- Modify: `src/preview/assets/app.css` (`.mw-replace-target`, `.mw-replace-field`)

Browser JS is verified manually + Playwright (the M3a/delete precedent; jsdom selection + contenteditable support is too weak to unit-test the gesture). Steps 1-5 are edits; Step 6 is the verification gate; Step 7 commits.

- [ ] **Step 1: Add the compose state variable**

In `src/preview/assets/app.js`, add a state var alongside the existing ones (after `var pendingTarget = null;`, line 19):

```javascript
  let replaceCompose = null; // { target:{start,end}, fieldEl, wrapEl } while typing a replacement in place
```

- [ ] **Step 2: Extend the × discard control to replace cards**

In `src/preview/assets/app.js`, in `renderRail`, change the discard-button guard (currently line 160 `if (note.type === 'delete') {`) to include replace:

```javascript
      if (note.type === 'delete' || note.type === 'replace') {
```

Leave the rest of that block (the `discardBtn` element, its `openDiscardConfirm` click handler, and `head.appendChild(discardBtn)`) unchanged. `openDiscardConfirm` and the generic `discardNote` transform already work for any note id.

- [ ] **Step 3: Add the compose helpers and `createReplace`**

In `src/preview/assets/app.js`, add this block immediately before `function openDraft(target) {` (line 519). Function declarations hoist, so the trigger added in Step 4 can reference these regardless of order.

```javascript
  // Wrap the current selection's range in a strikethrough "replace target" span. Returns the wrapper
  // (or null if it cannot be wrapped). surroundContents handles the clean single-node case; the
  // extractContents fallback handles a selection crossing .mw-run / element boundaries and is marked
  // so cancel can repaint (the fallback can disturb the breadcrumb runs in that region). The wrap is
  // transient: load() repaints from the server on commit, so it never persists.
  function wrapReplaceTarget(range) {
    var wrap = document.createElement('span');
    wrap.className = 'mw-replace-target';
    try {
      range.surroundContents(wrap);
    } catch (e) {
      try {
        wrap.appendChild(range.extractContents());
        range.insertNode(wrap);
        wrap.dataset.mwFallback = '1';
      } catch (e2) {
        return null;
      }
    }
    return wrap;
  }

  // Select text and start typing to propose a replacement (Google-Docs Suggesting mode): the
  // selection renders struck-through and an inline editable field opens right after it, seeded with
  // the typed character. The original stays on screen so the reading column keeps reflecting the file.
  function startReplace(target, seed) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (body.classList.contains('mw-clean')) reveal(true);
    clearPill();
    var wrap = wrapReplaceTarget(range);
    if (!wrap) return; // could not wrap: let the key no-op
    sel.removeAllRanges();

    var field = document.createElement('span');
    field.className = 'mw-replace-field';
    field.setAttribute('contenteditable', 'true');
    field.textContent = seed;
    wrap.parentNode.insertBefore(field, wrap.nextSibling);
    replaceCompose = { target: target, fieldEl: field, wrapEl: wrap };

    field.focus();
    var r = document.createRange();
    r.selectNodeContents(field);
    r.collapse(false); // caret to the end of the seed character
    sel.removeAllRanges();
    sel.addRange(r);

    field.addEventListener('keydown', onReplaceFieldKey);
  }

  function onReplaceFieldKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitReplace(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelReplace(); }
  }

  // Commit the in-place replacement: POST a replace note carrying the typed text, then load()
  // repaints (original -> mw-type-replace style, replacement in the rail card) and wipes the
  // transient compose DOM. An empty/whitespace field is a cancel (an empty replacement is a delete).
  function commitReplace() {
    if (!replaceCompose) return;
    var c = replaceCompose;
    var text = c.fieldEl.textContent;
    if (!text || text.trim() === '') { cancelReplace(); return; }
    replaceCompose = null; // prevent re-entry; load()/catch handles the transient DOM
    createReplace(c.target, text);
  }

  function createReplace(target, text) {
    fetch('/api/note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'replace', kind: 'span', start: target.start, end: target.end, text: text }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Replace failed'); });
        return r.json();
      })
      .then(function (data) {
        if (data && data.createdId) activeId = data.createdId;
        return load();
      })
      .catch(function (err) { showToast(err.message || 'Replace failed'); return load(); });
  }

  // Cancel the in-place compose: remove the field, unwrap the struck target (restoring the original
  // text), clear the selection. If the wrap used the extractContents fallback, repaint from the
  // server to guarantee the breadcrumb runs in that region are pristine.
  function cancelReplace() {
    if (!replaceCompose) return;
    var c = replaceCompose;
    replaceCompose = null;
    c.fieldEl.removeEventListener('keydown', onReplaceFieldKey);
    if (c.fieldEl.parentNode) c.fieldEl.parentNode.removeChild(c.fieldEl);
    var wrap = c.wrapEl;
    var usedFallback = wrap && wrap.dataset && wrap.dataset.mwFallback === '1';
    if (wrap && wrap.parentNode) {
      while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
      wrap.parentNode.removeChild(wrap);
    }
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    if (usedFallback) load();
  }
```

- [ ] **Step 4: Wire the printable-key trigger + click-away commit**

In `src/preview/assets/app.js`, add this block immediately after the existing Delete/Backspace `keydown` handler (after line 646, before the `dblclick` block on line 650):

```javascript
  // Select text and type a printable character to propose a replacement (Google-Docs Suggesting
  // mode). Guards: a bare single character (no Cmd/Ctrl/Alt), focus not already in an editable field
  // (so typing in a reply/draft - or in the compose field itself - is never hijacked), a non-collapsed
  // selection mapping to a source span, and no compose already open. Otherwise the key behaves
  // normally, which in this read-only doc is a no-op.
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

  // Clicking outside the compose field commits it (Google-Docs behavior); an empty field cancels.
  document.addEventListener('mousedown', function (e) {
    if (replaceCompose && e.target !== replaceCompose.fieldEl && !replaceCompose.fieldEl.contains(e.target)) {
      commitReplace();
    }
  });
```

- [ ] **Step 5: Add the CSS**

Append to `src/preview/assets/app.css`:

```css
/* Suggest-replace in-place compose (transient; wiped by load() on commit). The struck original is
   the replace target - a MUTED strikethrough, deliberately not delete-red, so a replace never reads
   as a delete. The inline editable field holds the proposed text and echoes the committed replace
   color (tint + underline) so it reads as a suggestion while it is typed. */
.mw-replace-target {
  text-decoration: line-through;
  text-decoration-color: var(--mw-muted);
  color: var(--mw-muted);
}
.mw-replace-field {
  outline: none;
  background: var(--mw-replace);
  color: var(--mw-ink);
  border-radius: 3px;
  padding: 0 2px;
  margin-left: 3px;
  box-shadow: inset 0 -2px 0 var(--mw-replace-line);
  white-space: pre-wrap;
}
```

- [ ] **Step 6: Verify in the real preview (manual + Playwright)**

Build the assets and run the preview against a throwaway copy (never the shared `sample.md`):

```bash
npx tsc -p . && cp -r src/preview/assets dist/preview/ 2>/dev/null; cp playground.md /tmp/mw-replace-test.md
node dist/cli.js preview /tmp/mw-replace-test.md
```

(If the build copies assets differently, confirm `dist/preview/assets/app.js` and `app.css` reflect the edits before loading the page.) Then verify each, in **dark, light, and sepia** (pick the theme from the in-preview picker):

- Mouse-select a phrase, type a character → the selection shows struck-through (muted, not red) and an inline field opens right after it, already holding that character; keep typing → the field grows and the line reflows. The original word stays visible.
- Press **Enter** → the field closes, the original renders with the `mw-type-replace` style (blue tint + underline), and a `replace` card appears in the rail with the typed replacement as its snippet. The file at `/tmp/mw-replace-test.md` still contains the original wrapped in `<!-- mw:.. -->` markers plus `"type":"replace"` and `"text":"..."`.
- **Click away** (mousedown elsewhere) with non-empty text → same commit.
- Press **Esc** → the compose tears down, the original prose is restored, no note is created.
- Type, then Backspace the field empty, press **Enter** → treated as cancel, no note created.
- Click the **×** on the replace card → "Remove this suggestion?" overlay → **Remove** → the suggestion is gone and the original prose is restored (markers gone from the file). **Cancel** / **Esc** back out.
- Open a card, type in its **Reply** box → it edits the textarea and does NOT start a replace (focus guard). Backspace there still edits the reply.
- On a selection, the **Comment pill** still appears and still creates a comment; pressing **Delete** still creates a delete suggestion. All three intents coexist on one selection.
- Try a multi-word selection that spans formatting (e.g. across a bolded word), type, then **Esc** → the prose is restored cleanly (the fallback-aware repaint).
- Confirm `node dist/cli.js lint /tmp/mw-replace-test.md` reports no errors after a create and after a discard.

Fix any issue found and re-verify before committing.

- [ ] **Step 7: Commit**

```bash
git add src/preview/assets/app.js src/preview/assets/app.css
git commit -m "$(cat <<'EOF'
feat(preview): suggest-replace by typing over a selection (in place)

Select text and start typing to propose a replacement: the original
renders struck-through and an inline field opens after it, seeded with
the typed key. Enter/click-away commits a replace note; Esc/empty
cancels. The original stays on screen (the column still reflects the
file). The card x discard now covers replace cards too. Focus guard
keeps typing in a reply/draft from starting a replace.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: all green, including the pre-existing suite (no regressions). The new tests from Tasks 1-2 pass; the edited "unsupported type" test passes.

- [ ] **Step 2: Type-check / build**

Run: `npx tsc -p .`
Expected: no type errors. The widened `createNote` opts (`type?: 'comment' | 'delete' | 'replace'`, `text?: string`) and the server's `type` union (`'comment' | 'delete' | 'replace'`) are sound, and the `createNote` call site passes `text`.

- [ ] **Step 3: Final real-preview smoke (all three themes)**

Re-run the Task 3 Step 6 verification once more end-to-end on a fresh `/tmp` copy in dark, light, and sepia, confirming the success criteria from the spec: select + type shows the struck original + inline field; Enter (or click-away) creates a replace note (blue style + card with the replacement); Esc and empty-commit cancel cleanly; × discards and restores; the comment pill and delete gesture still work on the same selection; lint clean throughout.

---

## Self-Review (completed while writing)

**Spec coverage:** trigger = printable key on a selection, guarded (Task 3 Step 4) · struck original kept visible + inline seeded field (Task 3 Step 3, Step 5) · Enter / click-away commit, Esc / empty cancel (Task 3 Steps 3-4) · record `type:'replace'` + `text`, comment optional → empty thread (Task 1) · server widening + `text` (Task 2) · `discardNote` unchanged / × on replace cards (Task 3 Step 2; server discard test in Task 2) · existing `mw-type-replace` render reused (no change; verified app.css:324) · no `DECISIONS.md` change (D42 already covers replace) · all-themes verification (Tasks 3, 4) · never on shared `sample.md` (Task 3 Step 6).

**Placeholder scan:** none — every code step shows complete code; every run step gives the command and expected result.

**Type consistency:** `createNote` opts use `type?: 'comment' | 'delete' | 'replace'` and `text?: string`; the server narrows `rawType` to the same union and passes `text`; the client POSTs `{type:'replace', kind:'span', start, end, text}` matching the server's read. The compose helpers (`wrapReplaceTarget`, `startReplace`, `onReplaceFieldKey`, `commitReplace`, `createReplace`, `cancelReplace`) and the `replaceCompose` state var are referenced consistently across Task 3 steps; the × guard widens the existing `openDiscardConfirm(card, note.id)` path unchanged.
