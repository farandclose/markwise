# Markwise previewer - Suggest-replace (Op 1: mouse-select + type) design
Date: 2026-06-08. Parent specs: `2026-06-07-previewer-suggest-delete-design.md` (established the typed-suggestion authoring pipeline: `createNote` `type` parameter, the generic `discardNote` transform, the card × discard + scoped-overlay confirm), `2026-06-04-previewer-create-note-design.md` (the `createNote`/`persist` write path), and `2026-06-07-previewer-selection-pill-design.md` (the selection model this rides on). Second slice of the human-authored suggestion work.

## 1. Context and goal
Suggest-delete shipped the "a gesture on a selection becomes a typed suggestion" pipeline: `createNote` takes a `type`, the server widens `POST /api/note`, `discardNote` retracts a suggestion, and the × control + scoped-overlay confirm give an undo. Delete needed **no inline text capture** - it is _selection + one keystroke + commit_.

This slice adds **suggest-replace**, which is delete plus the one piece delete deliberately skipped: **capturing the reviewer's typed replacement text, in place, on a read-only rendered document.** The protocol and renderer already support it fully (`type:"replace"`, the `text` field per lint L124, and the existing `mw-type-replace` blue-underline style). The gap is again purely **authoring**: the in-place compose field.

The interaction model, confirmed with the product owner, is **Google Docs Suggesting mode**: select text, start typing, and the original stays visible **struck-through** while the replacement is typed **inline right after it**. Both stay on screen, so the reading column still reflects the file (PRODUCT.md Principle 1) until the agent acts. This is more faithful to Google Docs than hiding the original, and it keeps Markwise's "the rendered column reflects the file" invariant intact during compose.

## 2. The reframed principle (already recorded)
No decision-log change is needed this slice. **D42** (added in the delete slice) already anticipates replace:

> The previewer lets a reviewer originate `delete` (this slice) and later `insert`/`replace` suggestions, not only `comment`s. A suggestion is the reviewer stating intent precisely - it is not the reviewer editing the prose.

A replace is the reviewer stating intent precisely (here is the span, here is what I would put in its place). The reviewer never mutates the prose; the agent applies the replacement, repairs the seam, and may decline or ask for clarification (D31/D32/D11), with the thread remaining authoritative (D18). The record is byte-identical to an agent-authored replace; origin is carried by `thread[0].by` as before.

## 3. Scope
**In this slice:**

- With a **non-collapsed mouse selection** in the document, pressing a **printable character key** starts an in-place replace: the selected span renders struck-through and an inline editable field, seeded with that character, opens immediately after it.

- Typing fills the field; the line reflows (the accepted cost of "in place"). **Enter** or **click-away** commits; **Esc** cancels. An **empty** replacement on commit is treated as cancel.

- Commit creates a `replace` note over the selected span carrying the typed `text`. The span then renders with the existing `mw-type-replace` style and a `replace` card appears in the rail showing the replacement text.

- A **comment is optional**: the replace is created with an empty thread; the reviewer can add a reason later via the card's Reply.

- The replace card carries the **× discard control** (same card-scoped overlay confirm as delete), extended to replace cards this slice.

- The Comment pill and the Delete gesture still work on the same selection. One selection, three intents: click the pill = comment; press Delete = delete; type = replace. They coexist without collision.

**Out (later or unchanged):**

- **Op 2: keyboard Shift+Arrow selection + type.** Next input method; needs the same custom keyboard text-navigation that delete's Op 2 needs (a read-only document has no native caret-browsing).

- **suggest-insert** (click + type at a collapsed caret; point anchor). Later slice.

- **Multi-line replacements.** The compose field is single-line; Enter commits rather than inserting a newline. A replacement spanning paragraphs is not authored here.

- **Discard (×) on comment/insert cards.** `discardNote` is generic, but only delete and (now) replace cards surface the control.

- The original text is **never removed or rewritten in the file** by the reviewer. A replace suggestion wraps the original span in markers and stores the proposed `text` in the record; the agent performs the substitution when acting on the suggestion. This is "suggest, don't edit." A cross-block selection is allowed (parity with delete) but is rarely meaningful for a single replacement string; it is treated as one span replace and left to the agent to interpret.

## 4. The trigger (behavior)
A single `keydown` handler on the document, distinct from the delete handler:

1. Fire only on a **printable single character**: `event.key.length === 1` (letters, digits, punctuation, space). Delete/Backspace/Enter/Arrow/etc. have multi-character `key` names and are therefore ignored here - the delete handler owns Delete/Backspace.

2. Ignore if any modifier that signals a shortcut is held: `event.metaKey`, `event.ctrlKey`, or `event.altKey` (so Cmd+C, Cmd+A, etc. pass through untouched). `shiftKey` is allowed (capital letters).

3. **Ignore if focus is in an editable field** (`textarea`, `input`, or contenteditable) - guard on `document.activeElement`. This also means that once compose starts (focus moves into the `.mw-replace-field` contenteditable), subsequent keystrokes flow into the field naturally and do not re-trigger this handler.

4. Ignore if a replace compose is already active.

5. Read the current selection via the existing `spanTargetFromSelection()`. Require a **non-collapsed** selection mapping to source offsets `{kind:'span', start, end}`. If it does not map, **no-op** (do not `preventDefault`; the key does whatever it normally would, which in a read-only doc is nothing).

6. Otherwise `preventDefault()`, clear the Comment pill, and enter compose mode (section 5), seeded with `event.key`.

A collapsed caret + a printable key is a **no-op in this slice** (collapsed-caret typing is the future insert gesture).

## 5. Compose in place (the new machinery)
A single replace compose is active at a time (like the single rail draft). State lives in module-level variables in `app.js`.

### 5.1 Building the compose DOM
On the triggering keystroke, with the live selection range in hand:

1. **Mark the original as the replace target.** Wrap the selected range in a `<span class="mw-replace-target">`. Use `range.surroundContents(span)` for the clean single-node case, with an `extractContents()` + `insertNode()` fallback for a selection crossing `.mw-run` boundaries. The class renders a **muted strikethrough** (token `--mw-muted` with `line-through`), deliberately **not** delete's red, so a replace target never reads as a delete.

2. **Open the inline field.** Create an inline `contenteditable` element `<span class="mw-replace-field" contenteditable="true">`, insert it immediately after the target span, set its text to `event.key` (the seed character), focus it, and place the caret at the end. Style it in the replace/suggestion color (echoing the committed `mw-type-replace` blue) so the proposed text reads as a suggestion as it is typed.

3. Capture, for commit, the `{start, end}` source offsets from the target (`spanTargetFromSelection()` was already read in section 4).

This DOM mutation is **transient and client-only**. The next `load()` repaints the document from the server, which is always the source of truth, so any structural imperfection from the multi-run wrap fallback is wiped on commit or cancel and never persists.

As the reviewer types, the contenteditable grows inline and the line reflows; the struck original moves with it because both are real inline DOM (not absolute overlays). The reading column position and width do not change (Principle 1); only prose below the edited line reflows, exactly as Google Docs does.

### 5.2 Commit
Commit fires on **Enter** (handled on the field, `preventDefault` so no newline is inserted) or **click-away** (a `mousedown` outside the field).

- Read `field.textContent`. If it is empty or whitespace-only, treat as **cancel** (section 5.3) - an empty replacement is a delete, and Delete already authors that.
- Otherwise call `createReplace({start, end}, text)`: `POST /api/note` with `{ type:'replace', kind:'span', start, end, text }`, modeled on `createDelete`. On success, set `activeId` to the returned `createdId` and call `load()`. The repaint draws the original span with the `mw-type-replace` style, drops a `replace` card in the rail with the replacement as its snippet, and removes the transient compose DOM.
- On error, surface the existing toast and leave the compose field open so the text is not lost.

### 5.3 Cancel
Cancel fires on **Esc** (handled on the field, `stopPropagation` so it does not also hit the document-level Esc handler that dismisses pills/drafts) or on an empty commit. Tear down the transient DOM: remove the `.mw-replace-field`, unwrap the `.mw-replace-target` (replace it with its own contents), and clear the selection. If a clean teardown cannot be guaranteed after the multi-run wrap fallback, fall back to a `load()` repaint (guaranteed-pristine, one cheap fetch).

## 6. Server, transform, and the record
### 6.1 `POST /api/note` (widened)
Extend the `type` allow-list (currently `'comment' | 'delete'`) to include `'replace'`:

- For `type === 'replace'`: read a `text` field (the replacement) and pass it to `createNote`. `kind` must be `'span'`; `body` (the optional comment) stays optional. `createNote` is the validation boundary (mirrors how `kind` and `type` are already handled), so a missing/empty `text` surfaces as the `createNote` 400.
- `'comment'` and `'delete'` behavior is unchanged.

### 6.2 `createNote` (extended) - the replace record
Add an optional `text` parameter and a `'replace'` branch, reusing all existing machinery (offset validation, the straddle-another-marker guard, `mintId`, span hashing, `insertLogRecord`, the span marker-wrapping path):

- `type === 'replace'` **requires** `kind === 'span'` (throw 400 otherwise) and a non-empty replacement: `typeof text === 'string' && text.trim() !== ''` (throw 400 `'a replace suggestion needs replacement text'` otherwise). The replacement is stored **as typed** (not trimmed), so intentional surrounding spaces are preserved; only whitespace-only text is rejected.
- The written `replace` record:
  - `type`: `"replace"`. **`text`**: the replacement string (present iff insert/replace, satisfying L124).
  - `state`: `"open"`. `disp`: `"none"`.
  - `anchor`: `{ kind:"span", hash, before, after }` - identical to a span comment/delete (the original span is wrapped in `<!-- mw:ID -->...<!-- /mw:ID -->`).
  - `thread`: `[]` when no comment was supplied (lint-clean; `disp:"none"` means L303 does not fire), else `[{ by:"reviewer", at, body }]`.
- `comment` and `delete` must never carry `text`; the server does not forward `text` for them, and `createNote` only attaches `text` in the replace branch.

The record is built correct so the `persist()` pipeline's `fixText`/`lintText` remain a pure safety net; a lint error leaves the file byte-identical (422).

### 6.3 Discard
No transform change. `discardNote(source, id)` already strips a note's markers and drops its `mw:log` record generically (it never reads `type`), so it retracts a replace exactly as it retracts a delete, restoring the original span to plain prose with no archive record. The existing `POST /api/note/:id/discard` route serves it.

## 7. The discard (×) control
The replace card carries the same **×** in its header as delete, opening the same **card-scoped overlay confirm** (`Remove this suggestion?` with `[Cancel] [Remove]`, a slight scrim over the card's own content, no reflow of the doc or other cards, never a browser `confirm()`). **Remove** -> `POST /api/note/:id/discard` -> `load()` repaints with the original prose restored. **Cancel**/**Esc** -> the overlay collapses.

Implementation: in `renderRail`, the condition that currently adds the × for `note.type === 'delete'` widens to `note.type === 'delete' || note.type === 'replace'`. Everything else (the overlay, the listener-leak-safe close-before-send ordering) is reused unchanged.

## 8. The replace card (rail rendering)
`renderRail` already tags cards `mw-card mw-type-${type}`, so a replace note is `mw-type-replace`. `noteSnippet` already returns the replacement for insert/replace types (`note.text ? '"' + note.text + '"' : ''`), so the card shows the proposed replacement text as its excerpt with **no payload/`NoteView` change**. The header label reads `replace`; the reply/resolve verbs stay (Reply adds a reason to a comment-less replace; Resolve archives, distinct from ×).

A replace with an empty thread therefore still has meaningful card content (the `replace` label + the replacement snippet), not a blank card.

## 9. Error handling
- **Selection straddling another note's markers:** the existing `createNote` span guard rejects -> existing error toast. No new client logic.
- **Overlapping suggested edits (D14):** caught by the lint gate; the write is refused (422), the file left untouched -> error toast.
- **Empty / whitespace-only replacement:** commit treats it as cancel client-side; the server `createNote` also rejects it (400) as defense in depth.
- **Replacement identical to the original:** not specially blocked (harmless; the agent no-ops). Not worth a guard in v0.
- **No valid selection when a printable key is pressed:** silent no-op (section 4); the key does nothing in the read-only doc.
- **Focus in an editable field:** the trigger is ignored (section 4), so typing in a reply/draft is never hijacked into a replace.
- **Discard of a missing/already-gone note:** 404 -> toast; `load()` keeps the UI consistent.

## 10. Testing
Following the delete-slice precedent (the gesture is vanilla JS, verified manually + Playwright; the transform/endpoint get full programmatic coverage):

- **Transform unit tests (`test/preview/mutate.test.ts`):**
  - `createNote` with `type:'replace'` + a span + `text` + no body -> record has `type:"replace"`, `text` set to the replacement, `thread:[]`, span anchor with hash; document lints clean.
  - `createNote` with `type:'replace'` + `text` + a body -> `thread:[{by:'reviewer',...}]`.
  - `createNote` with `type:'replace'` and **no** `text` (and with whitespace-only `text`) -> throws 400.
  - `createNote` with `type:'replace'` + `kind:'point'` -> throws 400 (replace must wrap a span).
  - `createNote` preserves intentional surrounding spaces in `text` (stored untrimmed).
  - `discardNote` on a replace note -> markers stripped, record dropped, no archive record, the original text back in plain prose, round-trips to lint-clean.
- **Server tests (`test/preview/server.test.ts`):** `POST /api/note` with `type:'replace'` creates the note and persists `text` (200 + `createdId`); `type:'replace'` with missing `text` -> 400.
- **Regression:** existing comment-create and delete-create/discard tests stay green (default `type:'comment'`; delete unchanged).
- **Manual + Playwright on a `/tmp` copy of `playground.md` (never on shared `sample.md`):**
  - Mouse-select a phrase, type a character -> original struck-through (muted, not red) + inline field opens seeded with that character; keep typing -> field grows, line reflows.
  - Enter -> field closes, original renders with the `mw-type-replace` style, a `replace` card appears with the typed replacement as its snippet; file lints clean with the original text intact.
  - Click-away with non-empty text -> same commit.
  - Esc -> compose torn down, original restored, no note created.
  - Type then delete back to empty, Enter -> treated as cancel, no note created.
  - × on the replace card -> overlay confirm -> Remove -> suggestion gone, original prose restored.
  - Type a reply in a card -> edits the textarea, does NOT start a replace (focus guard).
  - Comment pill still appears on the selection; clicking it still creates a comment; pressing Delete still creates a delete.
  - Verify in the real preview across **all three themes** (dark/light/sepia): struck target legible and distinct from delete-red, the inline field and its text legible, the committed `replace` underline and card legible.

## 11. Success criteria
A reviewer can select a phrase with the mouse and start typing to propose a replacement: the original shows struck-through while the new text is typed inline right after it, and Enter (or click-away) creates a `replace` note carrying that text. The original then renders with the replace style and a `replace` card shows the proposed text; the file stays lint-clean with the original text intact (the agent performs the substitution later). Esc, or committing an empty field, cancels cleanly with the prose restored. Clicking × and confirming discards the suggestion and restores the prose. Typing inside a reply/draft never starts a replace. The Comment pill and the Delete gesture still work on the same selection.
