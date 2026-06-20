# Selection-native comment pill — requirements

Date: 2026-06-20
Status: approved, implementing
Scope: Standard (three coupled interaction refinements to the previewer's comment pill)

## Problem

The "💬 Comment" pill is the entry point for commenting on a span. Today it is driven by
raw **mouse** events, while the insertion **caret** (the click-and-type insert affordance)
is driven by `selectionchange` and therefore always mirrors the live selection. That split
causes three observed gaps:

1. **Orphaned pill.** Click inside already-selected text and the selection collapses, but the
   pill lingers. Root cause: `mouseup` re-reads the selection a beat before the browser
   collapses it, re-shows the pill, and nothing reconciles it against the settled selection.
2. **No pill for keyboard selection.** Selecting with Shift+arrows (the existing word/line
   ladder) extends the selection and shows the caret, but never raises the pill — so `comment`
   is mouse-only, even though `delete` and `replace` are already keyboard-operable.
3. **No keyboard way to open the pill.** The composer opens only on a pill *click*; there is
   no Enter path, so even a keyboard-raised pill would be a dead end.

## Core decision

Make the pill a **function of the selection's lifecycle**, the way the caret already is. One
rule resolves all three: the pill exists exactly when there is a settled, commentable
selection, and it is reachable end-to-end without a mouse.

## Requirements

### R1 — Pill mirrors the settled selection
- When a span selection collapses or clears (click inside it, click away, Esc, caret move),
  the span pill disappears with it.
- The pill must not survive a selection that has gone away. No orphaned pill.
- Point pills (the double-click-on-a-gap insert affordance) keep their existing dismissal
  behavior (click-away / Esc); R1's auto-clear applies to span pills.

### R2 — Keyboard selection raises the pill on release
- A keyboard selection (Shift+arrows, including the word/line ladder) raises the pill the
  moment the selection gesture is **released** — defined as releasing the **Shift** key.
- This mirrors the mouse exactly: no pill while extending (as there is no pill mid-drag); the
  pill appears once, when the gesture completes.
- Re-extending (pressing Shift+arrow again after release) hides the pill until the next
  release. Never a pill during active extension.
- Explicitly NOT live-follow: the pill does not re-appear/re-position on every keystroke.

### R3 — Enter opens the composer
- While the pill is showing and focus is not in a text field, **Enter** opens the composer
  for that pill's target (the keyboard equivalent of clicking the pill).
- In a read-only doc with a live selection, Enter has no other meaning, so there is no
  conflict. (The type-to-replace handler already ignores Enter.)

## Out of scope (deferred)

- **Full accessibility pass.** This slice serves sighted keyboard users. Making the pill a
  focusable, screen-reader-announced control with managed focus is the deferred "full a11y"
  version, and the keyboard/SR gap that `PRODUCT.md` calls out remains open until then.
- No change to mouse selection feel, pill appearance/position, or the composer itself.

## Success criteria

- Select text, click inside it → pill is gone (no orphan).
- Shift+arrow select, release Shift → pill appears at the selection; Enter → composer opens;
  type + Add → note is created. End-to-end with no mouse.
- Mouse path (drag → pill → click → composer) is unchanged.
- All existing tests pass; sepia/light/dark unaffected.

## Implementation anchors (src/preview/assets/app.js)

- A shared `showPillFromSelection()` (guards: no compose/draft open, focus not in a field).
- `mouseup` shows via that helper (deferred a frame so the click-collapse settles first).
- `selectionchange` clears a **span** pill once `spanTargetFromSelection()` is null (R1).
- `keyup` on Shift → `showPillFromSelection()` (R2); the arrow ladder clears the pill on
  extension so it only reappears on release.
- `keydown` Enter, when a pill is showing and focus is outside fields → `openDraft(pendingTarget)` (R3).

## Addendum (2026-06-20) — Esc behavior and cross-paragraph highlights

Two follow-on questions surfaced while testing the selection flow. Both approved.

### R4 — Esc collapses to a caret, then clears (two-step)
- Previously, Esc on a showing pill cleared the whole selection — the caret vanished.
- Now the first Esc dismisses the pill and **collapses the selection to a caret at its start**
  (keeps the reviewer's place; they can keep navigating/typing by keyboard).
- A second Esc (no pill) clears the caret and hands the arrow keys back to page scrolling. The
  two steps are deliberate: a live caret keeps keyboard navigation engaged, so a single Esc cannot
  both keep the place and release the arrows.

### R5 — A comment highlights every paragraph it spans
- A selection that crosses a paragraph boundary already stored a note covering the full range (the
  agent always saw both paragraphs); only the **visual highlight** clamped to the first paragraph,
  because an inline `<span>` cannot legally cross a `<p>` — the browser auto-closes it at the break.
- The highlight is now rebuilt as one valid span per block: closed at each block end, reopened at
  the next block start, so every paragraph (or heading / list item) the note covers is lit.
- This is a render fix only; the data model and stored notes are unchanged. General across block
  types, not just paragraph→paragraph.

Implementation: R4 in `src/preview/assets/app.js` (Esc handler → `collapseToStart()`); R5 in
`src/preview/render.ts` (track open spans in `RenderEnv`, wrap each block's inline render to
close/reopen them). Covered by new cross-block tests in `test/preview/render.test.ts`.
