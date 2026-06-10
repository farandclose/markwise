# Keyboard Selection + Synthetic Caret (Op2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer move a visible synthetic caret and grow a selection from the keyboard (full macOS ladder), so the existing suggest-delete/replace/insert gestures fire without the mouse.

**Architecture:** Client-only, two pieces. (1) An overlay caret: one absolutely positioned, `pointer-events:none` element inside `.mw-doc`, positioned by measuring the collapsed selection's rect - the document DOM is never mutated. (2) A keyboard ladder: one `keydown` listener that maps arrow-key combos to `Selection.modify(move|extend, direction, granularity)` (spike-verified to work in this read-only doc). The existing gesture handlers read the live selection and need zero changes. Spec: `docs/superpowers/specs/2026-06-10-previewer-keyboard-selection-design.md`.

**Tech Stack:** Vanilla JS (`src/preview/assets/app.js`, an IIFE; no framework), CSS (`src/preview/assets/app.css`, theme tokens). vitest suite (163 tests) is the unchanged regression net. Playwright (MCP) for live verification.

---

### Task 1: Caret CSS (`app.css`)

`app.js`/`app.css` have **no unit tests by project convention**; this task is edit -> build -> commit. The JS that drives these classes lands in Task 2.

**Files:**
- Modify: `src/preview/assets/app.css` (the `.mw-doc` rule ~line 272, plus new rules at end of file)

- [ ] **Step 1: Make `.mw-doc` the caret's containing block**

The rule currently reads:

```css
.mw-doc { grid-column: 2; width: 100%; max-width: var(--mw-col); font-family: var(--mw-font-serif); font-size: 17.5px; line-height: 1.72; }
```

Add `position: relative;` (layout-neutral - no offsets, nothing moves):

```css
.mw-doc { position: relative; grid-column: 2; width: 100%; max-width: var(--mw-col); font-family: var(--mw-font-serif); font-size: 17.5px; line-height: 1.72; }
```

- [ ] **Step 2: Append the caret rules at the end of the file**

```css

/* Synthetic caret (Op2): an overlay bar above the prose, never in it. Position is set from the
   live collapsed selection by app.js; .mw-doc is its containing block so it scrolls with the
   column. pointer-events:none so it can never swallow a click. */
.mw-caret {
  position: absolute;
  width: 2px;
  background: var(--mw-ink);
  pointer-events: none;
  display: none;
  animation: mw-caret-blink 1.1s step-end infinite;
}
.mw-caret.mw-caret-on { display: block; }
@keyframes mw-caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .mw-caret { animation: none; }
}
```

- [ ] **Step 3: Build (copies assets into dist) and sanity-check the suite**

Run: `npm run build && npm test`
Expected: build exit 0; 163 passed, 0 failing.

- [ ] **Step 4: Commit**

```bash
git add src/preview/assets/app.css
git commit -m "feat(preview): synthetic caret styles (overlay bar, blink, reduced-motion)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Caret module (`app.js`)

**Files:**
- Modify: `src/preview/assets/app.js` (state block ~line 18-24; new functions after the `esc` helper ~line 31; the Escape handler ~line 891)

- [ ] **Step 1: Add caret state**

In the module state block (after the line `let anchorEls = []; // highlight rectangles over the text a draft is anchored to`), add:

```js
  let caretEl = null; // the synthetic caret overlay (created lazily, lives inside .mw-doc)
  let caretRaf = 0; // pending selectionchange -> updateCaret animation frame (0 = none)
```

- [ ] **Step 2: Add the caret module**

Insert the following block immediately after the `esc(s)` helper function (after its closing `}`):

```js

  // ---- Synthetic caret (Op2) ------------------------------------------------------------------
  // An overlay bar that shows where the collapsed selection sits in the prose. It never enters
  // the text flow (position:absolute in .mw-doc, pointer-events:none), so the document cannot
  // move (Principle 1). load() wipes .mw-doc's children; ensureCaretEl re-appends on demand.
  function ensureCaretEl() {
    if (!caretEl || !caretEl.isConnected) {
      caretEl = document.createElement('span');
      caretEl.className = 'mw-caret';
      caretEl.setAttribute('aria-hidden', 'true');
      docEl.appendChild(caretEl);
    }
    return caretEl;
  }

  function hideCaret() {
    if (caretEl) caretEl.classList.remove('mw-caret-on');
  }

  // Position the caret at the collapsed selection point, or hide it (non-collapsed selection,
  // selection outside the doc, compose open). Rects are viewport-space, translated into .mw-doc's
  // box, so page scroll needs no listener. A collapsed range can report a zero rect at soft
  // line-wraps and text-node boundaries; probe one character around the caret for an edge instead
  // - the caret must never simply vanish while the selection is inside the doc (spec section 4).
  function updateCaret() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || replaceCompose || insertCompose) {
      hideCaret();
      return;
    }
    var node = sel.focusNode;
    if (!node || !docEl.contains(node) || (caretEl && node === caretEl)) {
      hideCaret();
      return;
    }
    var range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    var r = range.getBoundingClientRect();
    var rect = { left: r.left, top: r.top, height: r.height };
    if (r.width === 0 && r.height === 0 && node.nodeType === 3) {
      var probe = document.createRange();
      var off = Math.min(sel.focusOffset, node.length);
      if (off < node.length) {
        probe.setStart(node, off);
        probe.setEnd(node, off + 1);
        var pr = probe.getBoundingClientRect();
        rect = { left: pr.left, top: pr.top, height: pr.height };
      } else if (off > 0) {
        probe.setStart(node, off - 1);
        probe.setEnd(node, off);
        var pl = probe.getBoundingClientRect();
        rect = { left: pl.right, top: pl.top, height: pl.height };
      }
    }
    if (!rect.height) {
      hideCaret();
      return;
    }
    var host = docEl.getBoundingClientRect();
    var c = ensureCaretEl();
    c.style.left = (rect.left - host.left) + 'px';
    c.style.top = (rect.top - host.top) + 'px';
    c.style.height = rect.height + 'px';
    c.classList.add('mw-caret-on');
  }

  // One pending frame max: selectionchange fires in bursts (mouse drags, Selection.modify calls).
  // This single re-sync point also covers clicks placing a caret, selections collapsing, Esc
  // clearing the selection, and load() wiping the column.
  document.addEventListener('selectionchange', function () {
    if (caretRaf) return;
    caretRaf = window.requestAnimationFrame(function () {
      caretRaf = 0;
      updateCaret();
    });
  });
  window.addEventListener('resize', updateCaret);
```

- [ ] **Step 3: Extend the Escape handler**

The existing handler reads:

```js
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (pillEl) {
      clearPill();
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      return;
    }
    var draft = railEl.querySelector('.mw-draft');
    if (draft) {
      draft.remove();
      clearAnchor();
      var s = window.getSelection();
      if (s) s.removeAllRanges();
    }
  });
```

Change it to (draft branch gains a `return`, then a final branch parks the keyboard - clearing the doc selection hides the caret via the selectionchange re-sync):

```js
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (pillEl) {
      clearPill();
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      return;
    }
    var draft = railEl.querySelector('.mw-draft');
    if (draft) {
      draft.remove();
      clearAnchor();
      var s = window.getSelection();
      if (s) s.removeAllRanges();
      return;
    }
    // No pill, no draft: park the keyboard caret - clear any doc selection (the caret follows
    // via the selectionchange re-sync).
    var ds = window.getSelection();
    if (ds && ds.rangeCount > 0 && ds.focusNode && docEl.contains(ds.focusNode)) ds.removeAllRanges();
  });
```

- [ ] **Step 4: Suite, typecheck, build**

Run: `npm test && npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: 163 passed; tsc exit 0; build exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/preview/assets/app.js
git commit -m "feat(preview): synthetic caret - overlay placement, re-sync, Esc parks it

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Keyboard ladder (`app.js`)

**Files:**
- Modify: `src/preview/assets/app.js` (new listener immediately before the existing Delete/Backspace keydown listener, the one whose comment block sits at ~line 835)

- [ ] **Step 1: Add the ladder listener**

Insert this block immediately BEFORE the Delete/Backspace `keydown` listener (so the arrow layer reads together with the other document-level gestures):

```js

  // ---- Keyboard ladder (Op2) ------------------------------------------------------------------
  // Arrow-key navigation over Selection.modify (spike-verified in this read-only doc). Plain
  // arrows move the caret; Shift extends the selection; Alt = word, Cmd+Left/Right = line
  // boundary (the macOS ladder). Only active once a click (or prior arrow) has the selection in
  // the prose - otherwise the keys are not intercepted and the page scrolls exactly as before.
  // The existing gesture handlers read the resulting selection unchanged: Shift+Arrow + Delete =
  // suggest-delete, Shift+Arrow + type = suggest-replace, moved caret + type = suggest-insert.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (replaceCompose || insertCompose) return; // the compose field owns its keys
    if (e.ctrlKey) return; // Ctrl combos (incl. macOS Ctrl+arrows Spaces switching) pass through
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return;
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || typeof sel.modify !== 'function') return;
    if (!sel.focusNode || !docEl.contains(sel.focusNode)) return; // keyboard not engaged: scroll as ever

    var horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    var granularity;
    if (e.metaKey) {
      if (!horizontal) return; // Cmd+Up/Down: browser default (out of scope per spec)
      granularity = 'lineboundary';
    } else if (e.altKey) {
      if (!horizontal) return; // Alt+Up/Down: not in the ladder
      granularity = 'word';
    } else {
      granularity = horizontal ? 'character' : 'line';
    }
    var direction = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? 'backward' : 'forward';
    e.preventDefault();
    sel.modify(e.shiftKey ? 'extend' : 'move', direction, granularity);
    updateCaret(); // immediate; the selectionchange re-sync would lag a frame
  });
```

- [ ] **Step 2: Suite, typecheck, build**

Run: `npm test && npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: 163 passed; tsc exit 0; build exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/preview/assets/app.js
git commit -m "feat(preview): keyboard ladder - Selection.modify arrows, word and line-boundary rungs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Live Playwright verification (CONTROLLER ONLY - do not delegate)

Per project process, browser verification is driven directly by the controller agent. Implements the spec's 10-point checklist (section 8). Geometry checks need no transition-none injection; if any THEME COLOR is measured, inject `* { transition: none !important }` first (established gotcha).

**Files:** none modified. Creates `/tmp/mw-kbd-verify.md` (never test on `sample.md` / `playground.md`).

- [ ] **Step 1: Fixture and server**

```bash
cat > /tmp/mw-kbd-verify.md <<'EOF'
# Keyboard Verify

The quick brown fox jumps over the lazy dog near the river bank today.

A second paragraph with more prose to navigate around while testing keys.
EOF
node dist/cli.js lint --strict /tmp/mw-kbd-verify.md
node dist/cli.js preview /tmp/mw-kbd-verify.md   # background; prints the localhost URL
```

Expected: lint clean; server URL printed. Navigate Playwright there.

- [ ] **Step 2: Caret appears on click, no layout shift (spec check 1)**

Record `document.querySelector('.mw-doc').scrollHeight` and the first `.mw-run`'s rect. Place a collapsed selection in "quick brown fox" (real click via Playwright on the text, or programmatic range + selectionchange flush). Expected: `.mw-caret.mw-caret-on` visible, positioned inside the clicked line's rect, height ~ the line height; `scrollHeight` and the run rect UNCHANGED.

- [ ] **Step 3: Movement rungs (spec check 2)**

From the caret: press `ArrowRight` x3 (caret x advances, selection stays collapsed), `ArrowDown` (next line/paragraph), `Alt+ArrowRight` (word jump), `Cmd+ArrowRight` then `Cmd+ArrowLeft` (line end/start). After each, assert `window.getSelection().isCollapsed === true` and the caret rect moved as described. Also assert `window.scrollY` did not change while keys were handled.

- [ ] **Step 4: Extension rungs + caret hide (spec check 3)**

`Shift+ArrowRight` x4 -> `sel.toString()` is 4 chars and `.mw-caret` is NOT `.mw-caret-on` (hidden while non-collapsed). `Shift+Alt+ArrowRight` extends by a word; `Shift+ArrowDown` extends a line; `Shift+Cmd+ArrowRight` extends to line end. Then `ArrowRight` (no Shift) collapses -> caret returns.

- [ ] **Step 5: Keyboard selection drives suggest-delete (spec check 4)**

Click before "lazy", `Shift+Alt+ArrowRight` (selects "lazy"), press `Delete`. Expected: delete card appears in the rail; on disk the file gains span markers around `lazy` and a `"type":"delete"` record; `node dist/cli.js lint --strict /tmp/mw-kbd-verify.md` clean. Discard it via the card x (cleanup for the next checks).

- [ ] **Step 6: Keyboard selection drives suggest-replace (spec check 5)**

Click before "river", `Shift+Alt+ArrowRight`, type `creek`. Expected: in-place replace compose opens seeded with `c`; finish typing, press Enter. On disk: a `"type":"replace"` record with `"text":"creek"`; lint clean. Discard it.

- [ ] **Step 7: Arrow-moved caret drives suggest-insert (spec check 6)**

Click at "fox", `Alt+ArrowRight` to hop after the word, type ` and cat`. Expected: insert compose opens at the caret; Enter commits a `"type":"insert"` record; lint clean. Discard it.

- [ ] **Step 8: Esc, textarea immunity, disengaged arrows (spec check 7)**

(a) With a caret active, press Escape -> selection cleared, caret hidden. (b) Click a card's reply textarea (create a note first or reuse one from a prior step before discarding), press arrows -> caret/selection in the DOC unaffected, textarea keeps its native behavior. (c) With no selection in the doc (after Esc), press `ArrowDown` -> `window.scrollY` changes (page scrolls; key not intercepted).

- [ ] **Step 9: Reduced motion + themes (spec checks 8, 9)**

Emulate `prefers-reduced-motion: reduce` (Playwright `page.emulateMedia`) -> computed `animation-name` of `.mw-caret` is `none`. Back to no-preference -> `mw-caret-blink`. Switch Dark -> Light -> Sepia via the picker: caret visible in each, computed `background-color` equals each theme's `--mw-ink` (inject `* { transition: none !important }` before color reads).

- [ ] **Step 10: Cleanup**

Stop the preview server (`lsof -ti:<port> | xargs kill`), close the Playwright page. No commit (nothing changed in the repo).
