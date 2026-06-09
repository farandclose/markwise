# Markwise previewer - suggest-insert (click + type)

Date: 2026-06-09. Parent specs: `2026-06-07-previewer-suggest-delete-design.md` and `2026-06-08-previewer-suggest-replace-design.md` (the direct-manipulation suggesting slices this completes), plus `2026-06-08-previewer-replace-inline-display-design.md` (the inline-display precedent this mirrors). Related: `PRODUCT.md` Principles 1-3, decisions D27 (a note carries proposed `text` for insert/replace) and D42 (suggesting is stating intent precisely; the agent still applies it).

## 1. Context and goal

suggest-delete (select + Delete) and suggest-replace (select + type) shipped. They are two of the three direct-manipulation gestures in the Google-Docs "Suggesting mode" model the product owner approved on 2026-06-07:

- select + Delete -> suggest a deletion (span anchor)
- select + type -> suggest a replacement (span anchor, carries `text`)
- **click + type -> suggest an insertion (point anchor, carries `text`)** <- this slice

Goal: let a reviewer propose inserting new text at a point in the document by clicking where it should go and typing it. The proposal is captured as an `insert` note; the agent applies, repairs, or declines it later (D42). Nothing is written into the prose itself - the file stores only a zero-width marker plus the proposed text in the `mw:log` record, exactly as delete/replace store their suggestions.

This is the last of the three gestures. Much of it is already scaffolded: `insert` is a valid `NoteType`; the `point` anchor (a single `<!-- mw:ID -->` marker, no close) is already created by `createNote` and rendered by `render.ts`; `text` is already documented as "present for insert/replace" (D27); the green `--mw-insert` token already exists per theme; and the two hard client pieces - the in-place compose field and click-to-source-offset mapping - already exist from suggest-replace and point-comments respectively.

## 2. Decision and principle fit

**Gesture: click + type, type-first (no caret in this slice).** The reviewer clicks to place an insertion point and types; the compose field appears at that point the instant they type. Confirmed with the product owner 2026-06-09. A read-only document shows no native blinking caret, so there is no pre-type preview of the insertion point in this slice; the compose field appearing is the feedback. A synthetic caret affordance is a deliberate later addition (see section 11) - the gesture mechanics (click -> mapped offset) and the visual affordance are independent layers, so adding a caret later is additive and touches neither the transform nor the rendering.

**Committed look: inline, mirroring replace.** A committed, open insert shows its proposed text inline at the insertion point, green and underlined, mirroring the just-shipped replace inline display. The alternative (a marker-only pillar with the text shown in the rail card alone) was rejected: it would contradict the inline display chosen for replace one day earlier.

- **Principle 1 (the document never moves):** not violated. The inserted text is column content shown in revealed mode; clean read mode hides it, so the reading surface still equals the file. The rail is unaffected by the gesture.
- **Principle 2 (annotation tied to its text):** strengthened - the proposed insertion sits exactly where it would go, not only in a distant rail card.
- **Principle 3 (the tool disappears):** the accepted cost is a little green ink per suggestion in revealed mode, the same weight already shown for replace; clean mode stays pristine.
- **"Suggest, don't edit" (D42):** preserved fully - the file's prose is never modified, only a marker and a log record are added.

## 3. The gesture (`src/preview/assets/app.js`)

The existing printable-character keydown handler (the one that starts a replace from a non-collapsed selection) is extended to handle the collapsed-caret case, which it currently no-ops. Order of checks is unchanged up to the selection read:

- guard: no compose already open; a bare single printable character (no Cmd/Ctrl/Alt); focus not in a `textarea`/`input`/`contenteditable` (so typing in a reply, draft, or the compose field itself is never hijacked).
- if `spanTargetFromSelection()` returns a span (non-collapsed selection) -> `startReplace` (unchanged).
- else read a **point target from the collapsed caret**: a new `pointTargetFromCaret()` returns `{ kind: 'point', start, range }` when `window.getSelection()` is collapsed and its focus maps to a source offset via the enclosing `.mw-run` (using the existing `srcOffset` helper); otherwise `null`.
- if a point target exists -> `preventDefault()` and `startInsert(pointTarget, e.key)`.
- else the key no-ops (a collapsed caret outside any run, e.g. a gap or block edge), exactly as point-comments already accept.

A single click in read-only-but-selectable prose leaves a collapsed caret in the clicked text node; no existing handler clears it (prose activation does not call `removeAllRanges`), so it survives to the keydown.

## 4. Compose, in place (`src/preview/assets/app.js`)

`startInsert(target, seed)` mirrors `startReplace` minus the strike-through (there is no original to wrap):

- if in clean mode, `reveal(true)` first; clear any pending pill.
- insert a green `contenteditable` field (`<span class="mw-insert-field">`) at the caret via the captured range (`range.insertNode(field)`), seeded with the typed character. Inserting at a collapsed caret inside a text node splits that node and places the field between the halves, so the field appears exactly at the insertion point inside the surrounding `.mw-run`.
- store transient state `insertCompose = { target, fieldEl }`, focus the field, and place the caret at the end of the seed.
- key handling on the field: **Enter** commits, **Esc** cancels (mirrors `onReplaceFieldKey`).
- **click-away commits** (mousedown outside the field), reusing the same document mousedown handler that commits a replace; an **empty/whitespace field cancels** (an empty insert is a no-op).

`commitInsert()` reads the field text; empty -> `cancelInsert()`. Otherwise it clears the transient state (preventing re-entry) and POSTs an insert note (section 7), then `load()` repaints from the server, wiping the transient compose DOM and rendering the committed inline text.

`cancelInsert()` removes the field and then `load()`s. Because inserting the field split a breadcrumb text node, a repaint is the simple way to guarantee the runs around the caret are pristine again (the replace compose uses the same repaint-on-disturbance safety). The newly created note, if any, is activated after the repaint via the existing `activeId = data.createdId` path.

## 5. Committed rendering (`src/preview/render.ts`)

`convertMarker` already resolves the note and, for a point anchor, returns `<span class="mw-point mw-type-${note.type}" data-mw-id="${id}"></span>` (empty). The change: for an **insert** point that carries `text`, emit that text **inside** the point span (rather than leaving it empty), escaped as content with `md.utils.escapeHtml` (the helper the replace inline display uses):

`<span class="mw-point mw-type-insert" data-mw-id="${id}">${escaped text}</span>`

A single span (not a nested or sibling span) is the right shape here: replace needs two pieces of content (the struck original plus the replacement), but an insert point has only the inserted text, so the point span itself carries it.

- A **point comment** (no `text`) still renders the empty `mw-point` span unchanged; only an insert fills it.
- The text lives directly in the point span, which already carries `data-mw-id`, so clicking the inserted text activates - and is highlighted alongside - its rail card with **no client change** (`activate` adds `.active` to every element with that id; here that is the point span itself).
- The text carries no `.mw-run` breadcrumb (no `data-s`/`data-e`): it is inert display text, never a selection or anchor target, because it is not in the file.
- **Clean-mode hiding is automatic:** the existing `.mw-clean .mw-point { display: none }` rule already hides every point span (and now the text inside an insert point) in clean read mode, so the reading column equals the file with no extra CSS.

## 6. Styling (`src/preview/assets/app.css`)

Mirrors the replace inline-display and compose styles, in the insert color. The committed inserted text lives in the `.mw-point.mw-type-insert` span; the green pillar continues to mark point comments.

- **Committed inserted text** (`.mw-revealed .mw-point.mw-type-insert`): a green tint, green underline, and the small radius/padding `.mw-replace-text` uses, but green (`--mw-insert` family) rather than blue. No `display: none` default is needed - the existing `.mw-clean .mw-point { display: none }` already hides it in clean read mode, so the reading column equals the file.
- **Point comments keep the pillar:** scope the existing green-pillar rule (and its active-outline at line 361) from `.mw-revealed .mw-point` to `.mw-revealed .mw-point.mw-type-comment`, so filling an insert point with text does not also draw a 4px pillar behind it. The only point types are comment and insert (delete/replace are span-only), so this split is exact and complete.
- **Active state**: `.mw-revealed .mw-point.mw-type-insert.active` deepens the tint (mirroring `.mw-replace-text.active`); join `.mw-point.mw-type-insert` to the existing `background-color` transition line so the active highlight eases in sync (the documented "both ends together" motion intent).
- **Compose field** (`.mw-insert-field`): mirrors `.mw-replace-field` (inline-block, green tint, green underline via box-shadow) but with no strike-through partner. It is editable and shows a caret only while composing.
- Verify legibility in Dark / Light / Sepia (the `--mw-insert` token exists in all three).

## 7. Data and server

**`createNote` (`src/preview/mutate.ts`):** point anchors already work (single open marker; `anchor: { kind: 'point', before, after }`). Three narrow changes:

- widen the `type` parameter union to include `'insert'`.
- require an `insert` to be a point: `if (type === 'insert' && kind !== 'point') throw` (the mirror of the existing delete/replace must-be-span guard).
- require and store `text` for insert as it already does for replace: extend the text-required check and the `...(type === 'replace' ? { text } : {})` record spread to also cover `insert`.

The resulting record: `{ id, type: 'insert', state: 'open', disp: 'none', anchor: { kind: 'point', before, after }, text, thread }` (empty thread when no comment was typed - a comment is optional for a suggestion, D27/D42).

**Server (`src/preview/server.ts`):** the `POST /api/note` type allow-list currently rejects anything but comment/delete/replace; add `'insert'`. `kind: 'point'` is already accepted.

**Client POST:** `createInsert(target, text)` mirrors `createReplace` but sends `{ type: 'insert', kind: 'point', start: target.start, text }` (no `end`).

## 8. The rail card (`src/preview/assets/app.js`)

Mostly already works. `noteSnippet` already returns an insert's quoted `text`, and `renderRail` already labels the card by type. One change: the **× discard** control, currently added only to `delete` and `replace` cards, extends to `insert` cards, so a suggested insertion can be removed (the `discardNote` transform is already type-agnostic - it strips the marker and drops the record). The empty-rail hint text gains a brief mention of the insert gesture alongside the existing comment/delete hints.

## 9. Edge cases

- **Click that does not map to a run** (a gap between blocks, padding, the very start/end of a block whose caret lands on the element rather than inside a run): `pointTargetFromCaret()` returns `null` and the key no-ops. Same accepted limitation as point-comments. Not an error.
- **Whitespace in the inserted text:** stored exactly as typed (not trimmed), so a reviewer who types a leading or trailing space to fit the insertion between words keeps it - matching replace. Only an entirely empty/whitespace field cancels.
- **Escaping:** `text` is HTML-escaped as content on render; quotes, `<`, `&` are safe.
- **Clean toggle:** flipping to clean hides every insert point's text via the existing `.mw-clean .mw-point` rule (CSS only, no refetch); the document reads as the file.
- **Adjacent suggestions:** an insert next to a delete/replace each render independently; no special handling.
- **Lint acceptance (verify first):** the persist pipeline runs `fixText` then `lintText` and refuses to write a document with any error-level finding. An `insert` + point-anchor + `text` record is defined by the protocol (D27), so it should lint clean, but the very first implementation step is a test that `createNote` -> `fixText` -> `lintText` produces no errors for an insert, so a surprise here surfaces immediately rather than as a runtime 422.

## 10. Testing

- **`src/preview/mutate.ts` (`test/preview/mutate.test.ts`):** `createNote` with `{ type: 'insert', kind: 'point', start, text }` writes a single `<!-- mw:ID -->` marker at `start`, a record with `type: 'insert'`, a point anchor, the verbatim `text`, and an empty thread (or a one-message thread when a comment is supplied); rejects an insert with `kind: 'span'`; rejects an insert with empty/whitespace `text`. Plus a guard test that the created document lints clean (no error findings).
- **`src/preview/render.ts` (`test/preview/render.test.ts`):** an open `insert` note renders `<span class="mw-point mw-type-insert" data-mw-id=...>...</span>` with the proposed text *inside* the span and HTML-escaped; a point `comment` still renders an empty `mw-point` span (no inner text); delete/replace/comment rendering is unaffected.
- **Server (`test/preview/server.test.ts`):** `POST /api/note` with `type: 'insert', kind: 'point'` succeeds and returns the new note in the payload; a bad insert (span kind, or missing text) returns 400.
- **Regression:** the full suite stays green; this touches `mutate.ts`, `render.ts`, `server.ts`, `app.js`, `app.css`.
- **Live (Playwright, a `/tmp` copy of a scratch doc, never `sample.md` or the shared `playground.md`), all three themes:** click between two words and type -> a green compose field appears at the point; Enter -> the inserted text shows inline green at the point and a card appears in the rail; toggle to clean -> the inserted text is gone and the document reads as the file; toggle back -> it returns; click the inserted text or its card -> both highlight; the card's × -> discard restores the document (marker and record gone); Esc mid-compose -> the field disappears and the prose is pristine; lint stays clean.

## 11. Success criteria

A reviewer can click at a point in the document, type, and on Enter (or click-away) see their text proposed inline at that point - green and underlined in revealed mode, across Dark/Light/Sepia - with a matching card in the rail that can be replied to, resolved, or discarded. Clean read mode shows the document exactly as the file reads (no inserted text). The file's prose is never modified; only a point marker and an `insert` log record carrying the proposed text are added, and the document lints clean throughout. The three direct-manipulation gestures (delete, replace, insert) are then complete.

**Explicitly deferred (not in this slice):** a synthetic blinking caret showing the insertion point before typing (an additive later refinement, by the product owner's choice on 2026-06-09); keyboard-only selection/placement (the separate Op2 work); and generalizing the × discard beyond the suggestion types (tracked separately, though insert is included here because an insert must be removable to be usable).
