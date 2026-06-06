# Markwise previewer - Comment pill on any selection (design)
Date: 2026-06-07. Parent spec: `docs/superpowers/specs/2026-06-01-previewer-ui-design.md` (section 7, the selection ladder). Continues `docs/superpowers/specs/2026-06-04-previewer-create-note-design.md`, which shipped double-click only and explicitly deferred this slice.

## 1. Context and goal
Create-note (M3a) shipped two ways to start a comment: double-click a word (span) and double-click a gap (point). It also added a `Cmd+Option+M` / `Ctrl+Alt+M` shortcut to open a draft from a selection. Two gaps surfaced during dogfooding:

1. **Triple-click and drag-select do nothing.** They produce a normal browser selection, but the Comment pill is bound to the `dblclick` event, so no pill appears. There is no mouse-driven way to comment on a multi-word phrase.
2. **The keyboard fallback is broken on macOS.** `Cmd+Option+M` is the system "Minimize All Windows" shortcut; pressing it minimizes the browser instead of opening a draft. So on a Mac, double-click on a single word is effectively the only working way to create a comment.

This slice closes both with one change: surface the Comment pill on **any completed text selection**, and remove the broken shortcut. It is the increment the create-note spec named as next ("drag-to-select an arbitrary phrase; multi-run spans").

## 2. Scope
**In this slice:**

- The Comment pill appears on any non-collapsed selection (double-click, triple-click, drag), reusing the existing offset-breadcrumb mapping.
- Double-click on a gap still creates a point comment (unchanged).
- `Esc` dismisses a pending pill (in addition to the existing click-away dismissal).
- Remove the `Cmd+Option+M` / `Ctrl+Alt+M` shortcut and its handler.

**Out (unchanged or later):**

- A custom sentence/paragraph selection ladder. We rely on the browser's native selection for triple-click and drag, not bespoke rung logic.
- Any server, endpoint, or `createNote` transform change. The span-create path already accepts multi-run spans.
- A block-boundary restriction on selections (see decision D-c).
- A replacement keyboard shortcut. The pill makes one unnecessary; we can add a Mac-safe chord later if a keyboard path is ever wanted.

## 3. Key decisions and why

- **D-a - Trigger on selection completion, not on a specific gesture.** Double-click, triple-click, and drag all end with a `mouseup` while a selection exists. Listening for the completed selection (one `mouseup` handler) covers all three at once, instead of enumerating gestures. This is simpler and matches create-note's founding principle of using only the browser's built-in selection.

- **D-b - Split span from point by collapsed-vs-not, across two handlers.** Span comments come from a non-collapsed selection (`mouseup`). Point comments come from a deliberate double-click on a gap, which leaves the selection collapsed (`dblclick`). Keeping point creation on `dblclick` and restricting it to the collapsed case means a single click never spawns a pill, and a double-click on a word does not double-fire (the `dblclick` handler ignores the non-collapsed case that `mouseup` already handled).

- **D-c - Allow cross-section selections.** A selection that spans more than one block (for example, from a paragraph through a heading into the next paragraph) is permitted. The reviewer states intent in the comment text (D5 / D31); the character range is a pointer to a region, not a precise instruction, so a large or block-crossing span is still useful. Restricting to one block would add boundary-detection logic and could override a selection the reviewer made on purpose. The only genuine integrity risk - a span overlapping another open note's markers - is already prevented by the existing `createNote` guard, so allowing cross-section spans does not open that hole. The cost is cosmetic only: a large highlight, and the pre-existing third-party-previewer marker-leak when a span wraps a heading.

- **D-d - Remove `Cmd+Option+M` rather than rebind it.** Once the pill covers every selection, the shortcut is redundant. Removing it eliminates the macOS collision and the cross-platform burden of finding a zero-collision chord. No keyboard path ships in this slice.

## 4. The trigger (behavior)
The previewer currently shows the pill from a single `dblclick` handler that branches on whether the selection is collapsed. This slice re-splits that logic:

- **`mouseup` on the document.** Read the current selection. If it is non-collapsed and both endpoints map to valid source offsets (`end > start`), show the Comment pill near the selection as a **span** target. This is the only path for span comments and covers double-click, triple-click, and drag.

- **`dblclick` on the document.** If the selection is **collapsed** (a double-click that landed on a gap), compute the caret source offset and show the pill as a **point** target. If the selection is non-collapsed, do nothing - `mouseup` already handled it.

- **Remove** the `Cmd+Option+M` / `Ctrl+Alt+M` keydown handler.

Event ordering keeps this clean: for any double-click the browser fires `mouseup` before `dblclick`, and `showPill` clears any existing pill before drawing the new one. A double-click on a word therefore shows exactly one (span) pill; a triple-click shows the pill for the growing selection and settles on the final (line/block) selection; a drag shows the pill once on release.

## 5. Native selection, headings, and cross-section spans
- **Native selection.** Triple-click selects whatever the browser selects (typically the line or block); drag selects exactly the dragged range. We do not implement custom sentence/paragraph rungs. Whatever the selection is, if its endpoints map to source offsets, it is commentable.
- **Headings.** Triple-clicking a heading selects the heading text and yields a span comment anchored on it. This is allowed and already a normal case (reviewers have commented on the document title).
- **Cross-section spans (D-c).** Permitted. The resulting note wraps the full source range, including any markdown between the endpoints. Structurally valid (balanced markers); the existing guard still blocks straddling another note's markers.

## 6. Dismissal
- The existing `mousedown`-elsewhere handler that clears a pending pill is retained.
- Add: pressing `Esc` clears a pending pill and the current selection. This is the only new dismissal affordance.

## 7. Data flow and server
No change. The browser still POSTs `{ kind:'span', start, end, body }` (or `{ kind:'point', start, body }`) to `/api/note`, which flows through the same lint-gated `createNote` path as today. Multi-run and cross-section spans are already supported by that transform. This slice edits only `src/preview/assets/app.js` (trigger rewrite, remove the shortcut, add `Esc`) and any minimal CSS needed for the pill.

## 8. Error handling
- A selection whose endpoints do not both resolve to `.mw-run` source offsets shows no pill (graceful no-op), unchanged from today.
- A selection that would overlap an existing note's markers is rejected by the server's `createNote` guard with the existing error toast; no new client logic.
- No new write path, so no new lint-gate or 422 surface beyond what create-note already has.

## 9. Testing
Browser gesture detection is vanilla JS and the hardest to unit-test - an acknowledged gap carried from M3a, where the precedent is programmatic HTTP coverage of the endpoint plus manual and Playwright dogfooding of the gestures. Follow that precedent:

- **Existing coverage stands:** the span-create path (`createNote`, `/api/note`) is already unit- and server-tested and is unchanged.
- **Gesture verification (Playwright + manual on `playground.md`):**
  - Double-click a word -> pill -> valid span note (regression: still works via `mouseup`).
  - Triple-click -> pill -> valid span note over the line/block.
  - Drag-select a phrase -> pill -> valid span note.
  - Double-click a gap -> pill -> valid **point** note (regression: collapsed case still works).
  - `Esc` dismisses a pending pill.
  - `Cmd+Option+M` no longer minimizes the window (because the handler is gone) and creates nothing.
- **Thin DOM test if practical:** simulate a non-collapsed selection plus `mouseup` and assert the pill element appears; skip if jsdom selection support makes it brittle.

## 10. Success criteria
A reviewer can start a comment by double-clicking a word, triple-clicking a line, or dragging across any stretch of text - including across sections - and in every case the Comment pill appears and leads to a valid, lint-clean note. Double-click on a gap still makes a point comment. Pressing `Cmd+Option+M` no longer minimizes the window. No keyboard shortcut is required to comment on a selection.
