# Markwise previewer - keyboard selection + synthetic caret (Op2)

Date: 2026-06-10. Parent specs: the suggest-edits trio (`2026-06-07-previewer-suggest-delete-design.md`, `2026-06-08-previewer-suggest-replace-design.md`, `2026-06-09-previewer-suggest-insert-design.md`). This slice also delivers the synthetic caret deferred by the insert spec (its section 11). Related: PRODUCT.md Principles 1-3, D42.

## 1. Context and goal

The three suggesting gestures are mouse-driven today: drag-select + Delete (delete), drag-select + type (replace), click + type (insert). Roadmap item C adds the keyboard: move a caret and grow a selection without the mouse, so the same gestures fire from `Shift+Arrow` selections.

Two product decisions confirmed 2026-06-10:

1. **Build the synthetic caret now** (Option A of three). A keyboard feature without a visible cursor is disorienting; the caret deferred from suggest-insert becomes load-bearing here, and insert gains pre-type feedback for free.
2. **Full macOS ladder** (not char/line only): character, word, line, and line-boundary movement, each with and without `Shift`.

## 2. Spike findings (2026-06-10, drives the architecture)

- Native `Shift+Arrow` does NOT extend a selection in non-editable content in Chromium: with a programmatically placed collapsed caret, real `Shift+ArrowRight` key events left the selection collapsed.
- `Selection.modify(alter, direction, granularity)` DOES work in this read-only doc: verified live for `character`, `word`, `line`, and `lineboundary` granularities, both `move` and `extend`. The whole navigation engine is therefore one browser call per keystroke.
- Arrow keys are currently untouched by `app.js` (only Delete/Backspace, single printable chars, and Escape are intercepted), so adding an arrow-key layer collides with nothing.

## 3. Decision: overlay caret + `Selection.modify` ladder

Three approaches considered:

1. **Overlay caret (CHOSEN):** one absolutely positioned blinking element, positioned by measuring the collapsed selection's rect (`Range.getBoundingClientRect`). Never mutates the document DOM. This is the Google-Docs/VS-Code pattern.
2. *Inline caret element (rejected):* `range.insertNode` of a caret span, as the insert compose does for its field. A compose box is one-shot; a caret moves every keystroke - constant text-node splitting and healing would be slow and fragile.
3. *Secretly editable document (rejected):* `contenteditable` would give a free native caret and native keyboard nav, but requires intercepting every mutation vector (typing, paste, drop, undo, IME, autocorrect) forever. One miss silently edits the document - unacceptable against "the column equals the file".

### Principle fit

- **Principle 1 (the document never moves):** the caret is `position: absolute` inside the doc container - zero layout impact, no reflow, no DOM mutation in the prose.
- **Principle 3 (the tool disappears):** a 2px ink-colored bar, blinking gently; hidden whenever it is not useful (selection active, compose open, focus elsewhere). Blink animation disabled under `prefers-reduced-motion` (consistent with the P3 motion rules).
- **D42 (suggest, don't edit):** unchanged - the keyboard only navigates; committing still goes through the existing gesture handlers and transforms.

## 4. The caret (`src/preview/assets/app.js` + `app.css`)

One module-level element, created lazily and appended to `.mw-doc` (`docEl`), class `mw-caret`:

- **Show/place:** a click in the prose already leaves a collapsed DOM selection (this is how insert's click+type works). A new `updateCaret()` reads `window.getSelection()`; if it is collapsed and its focus maps inside `.mw-doc`, position the caret at the collapsed range's client rect (translated into `docEl`'s coordinate space, so page scroll needs no listener) and show it. Caret height tracks the rect height (so it is taller in headings).
- **Wrapped-line edge:** a collapsed range at a soft line-wrap can return a zero-size rect; fall back to the focus text node's rect edge. (Exact fallback is an implementation detail for the plan; the requirement is: the caret never simply vanishes while the selection is inside the doc.)
- **Hide when:** the selection is non-collapsed (the selection highlight is the affordance; the caret returns when the selection collapses), the selection leaves the doc or is cleared, a compose opens (`replaceCompose`/`insertCompose`), Esc is pressed (existing Esc handler also clears the selection), or the click landed outside the prose.
- **Blink:** CSS `mw-caret-blink` keyframes (steps, ~1.1s period), `animation: none` under `prefers-reduced-motion`. Color `var(--mw-ink)`; width 2px; `pointer-events: none` so it can never swallow a click; excluded from selection mapping by construction (it lives outside `.mw-run` text and is never inside the selection's node path).
- **Re-sync points:** after every handled navigation key, on `selectionchange` (debounced via `requestAnimationFrame`, one pending frame max - this also catches mouse clicks and selection collapse), on window `resize`, and after `load()` repaints (the element is re-appended if the repaint wiped `docEl`'s children).

## 5. The keyboard ladder (`src/preview/assets/app.js`)

One new capture-less `keydown` listener, a pure mapping table over `Selection.modify`:

| Keys | Granularity | No Shift (`move`) | Shift (`extend`) |
|---|---|---|---|
| `ArrowLeft` / `ArrowRight` | `character` | move caret | extend selection |
| `ArrowUp` / `ArrowDown` | `line` | move caret | extend selection |
| `Alt+ArrowLeft/Right` | `word` | move caret | extend selection |
| `Cmd+ArrowLeft/Right` | `lineboundary` | move caret | extend selection |
| `Cmd+ArrowUp/Down` | not intercepted | (browser default) | (browser default) |

Direction maps Left/Up to `backward`, Right/Down to `forward` (`Selection.modify` handles RTL semantics; this doc is LTR).

**Guards (all must pass, mirroring the existing gesture guards):**

- not while a compose is open (`replaceCompose || insertCompose` -> the compose field owns the keys);
- focus not in `TEXTAREA`/`INPUT`/`isContentEditable` (reply boxes, drafts, the compose fields);
- `Ctrl` not held (and `Cmd` only as the line-boundary rung above - `Ctrl+`/other combos pass through);
- there is a current selection (collapsed or not) whose focus is inside `.mw-doc`. **If not, the key is not intercepted** - arrows scroll the page exactly as today. Activating the keyboard requires one click into the prose first.

On a handled key: `e.preventDefault()` (stops page scroll), call `sel.modify(...)`, then `updateCaret()`.

`Shift+Arrow` on an existing mouse selection extends it (the browser keeps anchor vs focus); plain Arrow with a non-collapsed selection collapses it and moves - both are `Selection.modify` defaults, no extra code.

## 6. Gestures come free (no changes to existing handlers)

The delete/replace/insert keydown handlers read the live DOM selection through `spanTargetFromSelection()` / `pointTargetFromCaret()`. A keyboard-built selection is a DOM selection, so:

- `Shift+Arrow` selection + `Delete`/`Backspace` -> suggest-delete (existing handler);
- `Shift+Arrow` selection + printable char -> suggest-replace (existing handler);
- caret moved by arrows + printable char -> suggest-insert (existing handler, which already reads the collapsed caret).

The selection-pill (comment on selection) also keys off the same selection and gains keyboard reach with no change. No transform, server, render, payload, or lint change anywhere in this slice.

## 7. Out of scope

- Caret browsing across non-prose chrome (rail, header): the caret lives in the doc column only.
- `Cmd+Up/Down` document-boundary jumps, `PageUp/PageDown` mapping, and any RTL-specific tuning.
- Touch/iPad affordances.
- Persisting caret position across repaints (`load()` after a commit re-renders the column; the committed note's activation is the existing post-commit affordance, and the caret simply follows the next click or stays hidden).

## 8. Testing

Client-only slice; per project convention `app.js`/`app.css` have no unit tests (the 163-test backend suite must stay green as the regression net, and `tsc`/build must stay clean). Live verification via Playwright by the controller, on a fresh `/tmp` doc, across Dark/Light/Sepia:

1. Click in prose -> caret appears at the click point (2px ink bar, correct height); no layout shift (compare `docEl.scrollHeight`/first-run rect before vs after).
2. Plain arrows move the caret (char/line); `Alt+Arrow` jumps words; `Cmd+Left/Right` jumps to line edges. The page does not scroll while the caret is active and the key is handled.
3. `Shift+Arrow` (each rung) grows a visible selection; the caret hides while non-collapsed and returns when collapsed.
4. `Shift+Arrow` selection + `Delete` -> a delete note is created on the selected source span (file record verified, lint clean).
5. `Shift+Arrow` selection + typing -> the in-place replace compose opens seeded with the typed char; commit produces a replace note.
6. Arrow-moved caret + typing -> the in-place insert compose opens at the caret.
7. Esc hides the caret and clears the selection; typing in a reply textarea is never hijacked by the ladder; with no caret in the doc, arrows scroll the page as before.
8. Reduced-motion: with `prefers-reduced-motion: reduce` emulated, the caret does not blink (static bar).
9. All three themes: caret visible and ink-colored; selection highlight unchanged.
10. Measurement gotcha note: theme/active background measurements need the `* { transition: none !important }` injection per the established Playwright gotcha; caret-position assertions are geometry, not color, and do not need it.
