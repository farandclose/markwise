# Markwise previewer - Suggest-delete (Op 1: mouse-select + Delete) design
Date: 2026-06-07. Parent specs: `2026-06-04-previewer-create-note-design.md` (create-note thin slice + `createNote`/`persist` path) and `2026-06-07-previewer-selection-pill-design.md` (the selection model this rides on). First slice of the human-authored suggestion work.
## 1. Context and goal
Today a reviewer in the previewer can only create a plain `comment`. The protocol already models typed suggestions fully (`type = comment | insert | delete | replace`, `text` for insert/replace, lint rules L121-L126), and the renderer already draws them (`mw-type-delete` is a red strikethrough). The gap is purely **authoring**: there is no way for a reviewer to originate a typed suggestion.

This slice closes the smallest, lowest-risk part of that gap: **suggest-delete, triggered by pressing Delete on a mouse selection.** Delete is the only suggestion type that needs no inline text capture - it is _selection + one keystroke + commit_ - so it proves the "a keystroke becomes a suggestion" pipeline without building any inline editor.

It is explicitly the first of two delete input methods. **Op 2 - keyboard selection (Shift+Arrow) + Delete - is out of this slice** because keyboard text-selection does not work in a read-only document without browser caret-browsing (off by default), so it needs bespoke keyboard-navigation machinery. Op 1 rides on the mouse selection that already works.
## 2. The reframed principle (decision-log update is part of this slice)
The create-note spec (line 28) carried this from D5/D31:

> Reviewer states intent; the agent revises prose. The reviewer never picks `insert` / `delete` / `replace`; they write what they mean and the agent interprets intent.

That "never picks" line was a v0 simplification, and this slice lifts it. The reframing, confirmed with the product owner: **a reviewer suggesting a delete/insert/replace IS stating intent - just more precisely than prose.** The reviewer never mutates the prose themselves; they propose, and the agent still acts on the suggestion, repairs the seam, and may decline (D31/D32), with the thread remaining authoritative for intent (D18). So the principle holds; only the authoring surface widens.

Deliverable: add **D42** to `DECISIONS.md` recording this, and update line 28 of the create-note spec so the decision log no longer contradicts the product. (Wording drafted in section 9.)
## 3. Scope
**In this slice:**

- Pressing **Delete or Backspace** while a **non-collapsed mouse selection** exists in the document creates a `delete` suggestion over that span.
  
- The span renders struck-through immediately (existing `mw-type-delete` style) and a `delete` note appears in the rail. Commit is immediate; no confirm dialog.
  
- A **comment is optional**: the delete is created with an empty thread; the reviewer can add a reason later via the card's existing Reply.
  
- The delete card shows a clear label and the text proposed for deletion, plus a **× discard control** (section 6) that, with an on-card confirm, removes the suggestion and restores the prose - serving as undo.
  
- The Comment pill still appears on the same selection. Click pill = comment; press Delete = delete suggestion. They coexist.
  

**Out (later or unchanged):**

- **Op 2: keyboard Shift+Arrow selection + Delete.** Next slice; needs custom keyboard text-navigation.
  
- **suggest-insert and suggest-replace.** Later slices (they need inline text capture).
  
- **Discard (×) on non-delete cards.** The `discardNote` transform is built generically, but only delete cards surface the control in this slice.
  
- **Structural deletes** (removing a whole heading/list/paragraph as a block operation) beyond what a normal text selection produces. A selection that crosses blocks is allowed (D-c from the pill spec) but is still treated as one span delete.
  
- The text is **never removed from the file** by the reviewer. A delete suggestion wraps the span in markers; the agent removes it when acting on the suggestion. This is "suggest, don't edit."
  
## 4. The trigger (behavior)
A single `keydown` handler on the document:

1. Fire only on `Delete` or `Backspace`.
  
2. **Ignore if focus is in an editable field** (`textarea`, `input`, or contenteditable) - so editing a draft/reply with Backspace is never hijacked into a delete suggestion. Guard on `document.activeElement`.
  
3. Read the current selection. Require a **non-collapsed** selection whose endpoints both map to valid source offsets via the existing breadcrumb mapping (`spanTargetFromSelection()` already returns `{kind:'span', start, end}` for exactly this case). If it does not, **no-op** (do not preventDefault; let the key do whatever it normally would, which in a read-only doc is nothing).
  
4. Otherwise `preventDefault()` and POST a delete suggestion for `[start, end)`.
  

A collapsed caret + Delete is a **no-op in this slice** (it is the future insert gesture). A double-click that left a collapsed point selection therefore does nothing on Delete.

Event-ordering note: `mouseup` shows the Comment pill; a later `keydown` Delete is independent. Pressing Delete does not need to clear the pill, but the create flow's repaint (`load()`) will clear it as it does for comment creation; the pill's existing dismissal handlers still apply.
## 5. Server, transform, and the record
### 5.1 `POST /api/note` (widened)
Accept an optional `type` field (default `'comment'`, preserving every existing caller and the comment flow byte-for-byte):

- `type` must be one of the known note types; for this slice only `'comment'` and `'delete'` are accepted, others -> 400 (insert/replace arrive in later slices).
  
- For `type === 'delete'`: require `kind === 'span'` (a delete must wrap text), and `body` is optional. Reject a `point` delete -> 400. Forbid a `text` field (delete carries none, L124).
  
- For `type === 'comment'`: unchanged (body required, point or span).
  
### 5.2 `createNote` (extended) - the delete record
Extend the existing `createNote` to take `type` and relax the body rule per type, reusing all of its machinery (offset validation, the straddle-another-marker guard, `mintId`, span hashing, `insertLogRecord`). The written `delete` record:

- `type`: `"delete"`. **No** `text` **field** (L124).
  
- `state`: `"open"`. `disp`: `"none"`.
  
- `anchor`: `{ kind: "span", hash, before, after }` - identical to a span comment (the wrapped span gets `<!-- mw:ID -->...<!-- /mw:ID -->`).
  
- `thread`: `[]` if no comment was supplied (lint-clean: `checkThread` only requires an array; `disp:"none"` means L303 does not fire), else `[{ by:"reviewer", at, body }]`.
  

Origin stays carried by `thread[0].by` when a comment exists; a comment-less delete has no author marker, which is fine - `type:"delete"` + `by:"reviewer"`-only flows are reviewer-authored by construction (the agent authors via its own pipeline, not this route).
### 5.3 `discardNote` (new transform) + `POST /api/note/:id/discard`
`discardNote(source, id)` = `resolveNote` **minus the archive step**:

1. Parse; find the open record for `id` (404 if absent).
  
2. Strip this note's inline markers right-to-left so offsets stay valid (restores the wrapped text to plain prose) - same Phase-1 loop `resolveNote` uses.
  
3. Drop the record from `mw:log`. **Do not** write an archive record.
  

Net effect: the file is byte-identical to before the suggestion was created (modulo log-block formatting), flowing through the same lint-gated `persist()` path. New route `POST /api/note/:id/discard` (no body), mirroring the resolve route.

Discard ≠ resolve: resolve archives and keeps history (the agent may still see it); discard erases. The × must call discard.
## 6. The discard (×) control and undo
The delete card carries a **×** in its header (delete cards only this slice). Interaction:

- Click **×** -> the card reveals an inline confirm: `Remove this suggestion? [Cancel] [Remove]`. **Never a browser** `confirm()` **dialog** (heavy, and it would block the previewer's automation).
  
- **Remove** -> `POST /api/note/:id/discard` -> `load()` repaints; the strikethrough is gone and the prose is restored.
  
- **Cancel** or **Esc** -> the confirm collapses; nothing happens.
  

Framing: the × is a permanent "discard this suggestion" control. Immediately after an accidental Delete it is the undo; later it is how you retract a deliberate suggestion. One control, two jobs - which is why we build the generic `discardNote` now rather than a special-case undo.
## 7. The delete card (rail rendering)
`renderRail` already tags cards `mw-card mw-type-delete` and has a header (`mw-card-type` + `mw-card-snippet`), a thread, and the reply/resolve verbs. Changes for a delete note:

- **Label + excerpt:** show a clear type label and the text proposed for deletion. The excerpt is read from the rendered doc span (`[data-mw-id="ID"]` carries the struck text in the DOM), so **no payload/**`NoteView` **change is needed**. A delete with an empty thread therefore still has meaningful card content (label + struck excerpt), not a blank card.
  
- **× control** in the header (section 6).
  
- Reply/resolve verbs stay: Reply adds a reason to a comment-less delete; Resolve still means "handled/archive" and is distinct from ×.
  

`noteSnippet` currently returns the last thread body for non-insert/replace types, which is `''` for a comment-less delete - hence reading the excerpt from the doc span instead.
## 8. Error handling
- **Selection straddling another note's markers:** the existing `createNote` guard rejects -> existing error toast. No new client logic.
  
- **Overlapping suggested edits (D14):** two overlapping deletes are caught by the lint gate; the write is refused (422) and the file left untouched -> error toast. (With only delete in this slice, this is the single overlap case.)
  
- **No valid selection on Delete:** silent no-op (section 4).
  
- **Focus in an editable field:** the trigger is ignored (section 4) so reply/draft editing is unaffected.
  
- **Discard of a missing/already-gone note:** 404 -> toast; `load()` keeps the UI consistent.
  
## 9. Decision-log wording (draft)
`DECISIONS.md`, new entry:

> ### D42 - Reviewers may author typed suggestions; suggesting is precise intent, not direct editing (2026-06-07)
> 
> Extends D5/D31. The previewer lets a reviewer originate `delete` (this slice) and later `insert`/`replace` suggestions, not only `comment`s. A suggestion is the reviewer stating intent precisely - it is not the reviewer editing the prose. The agent still applies the suggestion, repairs the seam, and may decline or ask for clarification (D31/D32/D11); the thread remains authoritative for intent (D18). Records are byte-identical to agent-authored ones; origin is carried by `thread[0].by` as before. Supersedes the create-note spec's "the reviewer never picks insert/delete/replace," which was a v0 authoring simplification.

Create-note spec line 28: change "The reviewer never picks `insert` / `delete` / `replace`" to note that the reviewer may now _suggest_ these as precise statements of intent, with the agent still doing the prose revision (cross-reference D42).
## 10. Testing
Following the M3a precedent (gesture detection is vanilla JS, verified manually + Playwright; the transform/endpoint get full programmatic coverage):

- **Transform unit tests (**`test/preview/mutate.test.ts`**):**
  
  - `createNote` with `type:'delete'` + a span + no body -> record has `type:"delete"`, no `text`, `thread:[]`, span anchor with hash; document lints clean.
    
  - `createNote` with `type:'delete'` + a body -> `thread:[{by:'reviewer',...}]`.
    
  - `createNote` with `type:'delete'` + `kind:'point'` -> throws (delete must be a span).
    
  - `discardNote` -> markers stripped, record dropped, **no** archive record; round-trips to lint-clean; the wrapped text is back in plain prose.
    
  - `discardNote` on an unknown id -> throws 404.
    
- **Server tests (**`test/preview/server.test.ts`**):** `POST /api/note` with `type:'delete'` validates kind/text; `POST /api/note/:id/discard` removes the note and returns the repainted payload.
  
- **Regression:** existing comment-create tests stay green (default `type:'comment'`).
  
- **Manual + Playwright on** `playground.md` (never on shared `sample.md`):
  
  - Mouse-select a phrase, press Delete -> strikethrough + delete card appears; file lints clean.
    
  - Press Backspace -> same.
    
  - Select, press Delete, then × -> confirm -> suggestion gone, prose restored.
    
  - Type a reply in a card and hit Backspace -> edits the textarea, does NOT create a delete (focus guard).
    
  - Collapsed caret + Delete -> nothing.
    
  - Verify in the real preview across **all three themes** (dark/light/sepia): strikethrough legible, card label + excerpt + × legible, confirm reveal readable.
    
## 11. Success criteria
A reviewer can select a phrase with the mouse and press Delete to propose its removal; the text shows struck-through, a delete note appears with the excerpt and a × control, and the file stays lint-clean with the text intact (the agent removes it later). Clicking ×, confirming on the card, fully discards the suggestion and restores the prose. Editing a comment/reply with Backspace never creates a delete. The Comment pill still works on the same selection. The decision log reflects that reviewers may now author suggestions as precise intent.
