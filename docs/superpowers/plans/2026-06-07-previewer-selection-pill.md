# Comment Pill on Any Selection - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the previewer's Comment pill appear on any completed text selection (double-click, triple-click, or drag), and remove the broken `Cmd+Option+M` shortcut.

**Architecture:** Browser-only change in `src/preview/assets/app.js`. The pill trigger moves from the `dblclick` event to a `mouseup` handler that reads the current selection - double-click, triple-click, and drag all end with a `mouseup` while a selection exists. Point comments stay on a double-click that lands on a gap (collapsed selection). The existing offset-breadcrumb mapping (`srcOffset`) and the `createNote` server path are reused unchanged. One vitest test pins the cross-section span guarantee that the new UI now makes reachable.

**Tech Stack:** Vanilla browser JS (no framework, no build step for the asset's logic), TypeScript transform/server (`createNote`), vitest. The asset is served from `dist/preview/assets/` and copied there by `npm run build`.

**Spec:** `docs/superpowers/specs/2026-06-07-previewer-selection-pill-design.md`

---

## File Structure

- **Modify** `test/preview/mutate.test.ts` - add one test pinning that a span crossing a section boundary (a heading) creates a valid, lint-clean note (Task 1).
- **Modify** `src/preview/assets/app.js` - replace `targetFromEvent` with `spanTargetFromSelection`; add the `mouseup` span trigger; restrict `dblclick` to the point-on-gap case (Task 2); remove the `Cmd+Option+M` handler and add `Esc`-to-dismiss (Task 3).

No server, endpoint, CSS, or `createNote` changes. The pill element and its styling already exist.

---

## Task 1: Pin the cross-section span guarantee (createNote)

The new UI lets a reviewer select across blocks for the first time, so the `createNote` path now genuinely receives cross-section spans. Lock that behavior with a test. `createNote` already accepts arbitrary spans, so this test should pass on the first run; if it fails, `createNote` must be fixed before proceeding and that fix becomes part of this task.

**Files:**
- Test: `test/preview/mutate.test.ts` (add inside the existing `describe('createNote', ...)` block, after the last test)

- [ ] **Step 1: Write the test**

Add this test as the final `it(...)` inside the `describe('createNote', () => { ... })` block (just before the closing `});` of that describe), reusing the block's existing `const at`:

```js
  it('allows a span that crosses a section boundary (a heading) and lints clean', async () => {
    const { fixText } = await import('../../src/fix.js');
    const { lintText } = await import('../../src/lint.js');
    const CROSS = [
      '# Demo',
      '',
      'First paragraph ends here.',
      '',
      '## Section Two',
      '',
      'Second paragraph starts here.',
      '',
    ].join('\n');
    const start = CROSS.indexOf('ends');
    const end = CROSS.indexOf('starts') + 'starts'.length;
    const { output, id } = createNote(CROSS, {
      kind: 'span',
      start,
      end,
      body: 'rethink how these two sections fit',
      at,
    });
    // The marker pair wraps the whole cross-section range, including the heading between the ends.
    expect(output).toContain(`<!-- mw:${id} -->ends here.`);
    expect(output).toContain(`starts<!-- /mw:${id} -->`);
    expect(output).toContain('## Section Two');
    // The created record is self-correct: fix changes nothing and it lints clean.
    expect(fixText(output).changes).toEqual([]);
    expect(lintText(output).filter((f) => f.severity === 'error')).toEqual([]);
  });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: PASS (the new test plus all existing `mutate` tests). If the new test FAILS, `createNote` does not handle cross-section spans - stop and fix `createNote` so the markers wrap the full range and the output lints clean, then re-run.

- [ ] **Step 3: Commit**

```bash
git add test/preview/mutate.test.ts
git commit -m "test: pin cross-section span support in createNote"
```

---

## Task 2: Show the Comment pill on any selection (mouseup trigger)

Replace the dblclick-only pill trigger. Add a `mouseup` handler that shows the pill for any non-collapsed selection (covers double-click, triple-click, drag). Keep point comments on a double-click that lands on a gap. Remove the now-unused `targetFromEvent`.

**Files:**
- Modify: `src/preview/assets/app.js`

- [ ] **Step 1: Replace `targetFromEvent` with `spanTargetFromSelection`**

Find this function (it begins with the comment `// Read the current double-click result into a creation target, or null if unusable.`):

```js
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
    var pos = caretRangeAt(e.clientX, e.clientY);
    if (pos) {
      var off = srcOffset(pos.startContainer, pos.startOffset);
      if (off != null) {
        return { kind: 'point', start: off, rect: { left: e.clientX, top: e.clientY, width: 0 } };
      }
    }
    return null;
  }
```

Replace it entirely with:

```js
  // Read the current selection into a span creation target, or null if it is collapsed or does
  // not map to source offsets. Drives the mouseup trigger (double-click, triple-click, or drag).
  function spanTargetFromSelection() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    var r = sel.getRangeAt(0);
    var s = srcOffset(r.startContainer, r.startOffset);
    var en = srcOffset(r.endContainer, r.endOffset);
    if (s != null && en != null && en > s) {
      return { kind: 'span', start: s, end: en, rect: r.getBoundingClientRect() };
    }
    return null;
  }
```

- [ ] **Step 2: Replace the `dblclick` handler with the `mouseup` + `dblclick` pair**

Find this handler:

```js
  docEl.addEventListener('dblclick', function (e) {
    var target = targetFromEvent(e);
    if (target) showPill(target);
  });
```

Replace it entirely with:

```js
  // A completed selection (double-click a word, triple-click a line, or drag a phrase) shows the
  // pill on mouse release. All three end with a mouseup while a non-collapsed selection exists.
  docEl.addEventListener('mouseup', function () {
    var target = spanTargetFromSelection();
    if (target) showPill(target);
  });

  // A double-click that lands on a gap leaves the selection collapsed; offer a point comment there.
  // A double-click on a word is non-collapsed and is already handled by the mouseup trigger above.
  docEl.addEventListener('dblclick', function (e) {
    if (spanTargetFromSelection()) return;
    var pos = caretRangeAt(e.clientX, e.clientY);
    if (!pos) return;
    var off = srcOffset(pos.startContainer, pos.startOffset);
    if (off != null) {
      showPill({ kind: 'point', start: off, rect: { left: e.clientX, top: e.clientY, width: 0 } });
    }
  });
```

- [ ] **Step 3: Confirm no other reference to `targetFromEvent` remains**

Run: `grep -n "targetFromEvent" src/preview/assets/app.js`
Expected: no output (the function and its only caller are gone).

- [ ] **Step 4: Build and run the full suite (no regression)**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS. (The asset logic has no unit tests; this confirms the TypeScript build and the unchanged transform/server tests still pass, and copies the edited `app.js` into `dist/preview/assets/`.)

- [ ] **Step 5: Verify the gestures in a browser**

Start the previewer: `node dist/cli.js preview playground.md` and open the printed URL (or drive it with Playwright). Confirm each:
- Double-click a word -> Comment pill appears -> Add creates a valid span note.
- Triple-click a line -> pill appears over the line -> Add creates a valid span note.
- Drag-select a phrase (including across a heading into the next section) -> pill appears -> Add creates a valid span note.
- Double-click a gap between words -> pill appears -> Add creates a **point** note (regression check).
- A plain single click shows no pill.

If any gesture misbehaves, fix `app.js` before committing.

- [ ] **Step 6: Commit**

```bash
git add src/preview/assets/app.js
git commit -m "feat(preview): show the Comment pill on any selection (double/triple/drag)"
```

---

## Task 3: Remove the Cmd+Option+M shortcut and add Esc-to-dismiss

Delete the broken `Cmd+Option+M` / `Ctrl+Alt+M` handler (it minimizes the window on macOS and is now redundant). Add `Esc` to dismiss a pending pill.

**Files:**
- Modify: `src/preview/assets/app.js`

- [ ] **Step 1: Remove the Cmd+Option+M handler and add the Esc handler**

Find this handler:

```js
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
          openDraft({ kind: 'span', start: s, end: en });
        }
      }
    }
  });
```

Replace it entirely with:

```js
  // Esc dismisses a pending pill and clears the selection.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pillEl) {
      clearPill();
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    }
  });
```

- [ ] **Step 2: Confirm the shortcut is gone**

Run: `grep -n "altKey\|openDraft({ kind: 'span'" src/preview/assets/app.js`
Expected: no output (the only `altKey` use and the keyboard-driven `openDraft` span call are removed; `openDraft` itself remains, called from the pill).

- [ ] **Step 3: Build and run the full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS.

- [ ] **Step 4: Verify in a browser**

With `node dist/cli.js preview playground.md` running:
- Select some text, then press `Esc` -> the pill disappears and the selection clears.
- Press `Cmd+Option+M` -> the window no longer minimizes from the page and nothing is created (the handler is gone; macOS may still treat it as a system shortcut, which is fine - we no longer depend on it).

- [ ] **Step 5: Commit**

```bash
git add src/preview/assets/app.js
git commit -m "feat(preview): remove Cmd+Option+M shortcut, add Esc to dismiss the pill"
```

---

## Task 4: Final verification

- [ ] **Step 1: Full build, typecheck, and test**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS.

- [ ] **Step 2: Full gesture matrix in a browser**

With `node dist/cli.js preview playground.md` running (Playwright or manual), confirm all spec section 9 scenarios in one pass:
- Double-click word -> span note.
- Triple-click line -> span note.
- Drag phrase -> span note.
- Drag across a section boundary (into a heading) -> span note (cross-section allowed).
- Double-click gap -> point note.
- `Esc` dismisses a pending pill.
- `Cmd+Option+M` creates nothing.
- Each created note lints clean: `node dist/cli.js lint playground.md` reports 0 errors.

- [ ] **Step 3: Restore the dogfood file if desired**

The verification above writes notes into `playground.md`. If you want a clean slate afterward: `node dist/cli.js export playground.md -o /tmp/clean.md && cp /tmp/clean.md playground.md` (or resolve the test notes in the previewer).

---

## Self-Review (completed during planning)

- **Spec coverage:** D-a (mouseup trigger) -> Task 2. D-b (span on selection, point on collapsed dblclick) -> Task 2. D-c (cross-section allowed) -> Task 1 (transform guarantee) + Task 2/4 (UI). D-d (remove Cmd+Option+M) -> Task 3. Esc dismissal -> Task 3. Native selection / no custom ladder -> inherent (no rung code added). No server change -> confirmed (no task touches the server). Testing (spec section 9) -> Task 4 matrix.
- **Placeholder scan:** none; every code and command step is concrete.
- **Type/name consistency:** `spanTargetFromSelection` defined in Task 2 Step 1 and used in Task 2 Step 2; `srcOffset`, `caretRangeAt`, `showPill`, `clearPill`, `openDraft`, `pillEl` are all pre-existing in `app.js`; `createNote`, `fixText`, `lintText` match their existing signatures.
