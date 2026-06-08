# Markwise previewer - Inline display of a committed replace suggestion

Date: 2026-06-08. Parent spec: `2026-06-08-previewer-suggest-replace-design.md` (the suggest-replace authoring slice this refines). Related: `PRODUCT.md` Principles 1-3, and the render pipeline (`src/preview/render.ts`).

## 1. Context and goal
suggest-replace shipped: select text + type proposes a `replace` note that wraps the original span and carries the proposed `text`. During **compose**, the original renders struck-through with the replacement typed inline right after it (Google Docs Suggesting mode). But on **commit**, that inline view collapses: `render.ts` only adds a `mw-type-replace` class to the original (blue tint + underline) and the replacement moves to the rail card alone. The reading column no longer shows *what* the original would become - the reviewer (and a later reader) sees a highlighted word with no visible replacement unless they look at the card.

Goal: make the committed state match the compose state. A committed, open `replace` keeps the original **struck-through** with the proposed replacement shown **inline right after it**, persistently, until an agent applies it or the reviewer discards it. The rail card is unchanged.

## 2. Decision and principle fit
Chosen treatment (confirmed with the product owner 2026-06-08): **struck original + inline replacement** (not replacement-only, not status-quo). This is a **render-only** change.

- **No file / protocol / transform / compose change.** The file still stores only the original (wrapped in `<!-- mw:ID -->` markers) plus the replacement in the `mw:log` record; "suggest, don't edit" is fully preserved and the agent still performs the substitution later (D42). Only how an open replace *renders* changes.
- **Principle 1 (the document never moves):** not violated. Principle 1 governs the *rail* not shifting the reading column; the inline replacement is column content. It is in fact more stable than today, where committing makes the just-typed replacement vanish from the column.
- **Principle 2 (annotation tied to its text):** strengthened - the proposed replacement sits immediately beside the word it replaces, not only in a distant rail card.
- **Principle 3 (the tool disappears):** the accepted cost - a struck original plus an inline replacement is a bit more ink per suggestion, the same weight already shown during compose. The clean-mode rule below keeps the *reading* surface pristine.

## 3. Scope
**In:** an open `replace` note, in **revealed** mode, renders as the struck original immediately followed by the inline replacement text. All three themes.

**Out / unchanged:**
- **Clean mode** still shows the pure file: the original un-struck, the injected replacement hidden. The reading surface equals the file's prose.
- The **compose** interaction (already shows this), the **rail card** (keeps its label, `"text"` snippet, Reply/Resolve/x), and `comment` / `delete` / future `insert` rendering.
- No change to the file, the `mw:log` record, `POST /api/note`, `createNote`/`discardNote`, or the accept/apply flow (the agent's job).

## 4. Rendering (`src/preview/render.ts`)
The change is localized to `convertMarker`, which already resolves the note (`env.openById.get(id)`) before branching on open/close.

- **Close marker, replace note:** instead of returning `</span>`, return `</span>` **followed by** a sibling span carrying the replacement:
  `</span><span class="mw-replace-text" data-mw-id="${escapeAttr(id)}">${md.utils.escapeHtml(note.text)}</span>`
- The original keeps its `mw-span mw-type-replace` wrapper and `data-mw-id` (so it still activates and is escaped exactly as today).
- The replacement span carries the **same `data-mw-id`** so clicking it activates the same card and the active-highlight covers the pair.
- `note.text` comes from `NoteView` (already on the payload) and is HTML-escaped as text content via `md.utils.escapeHtml` (the same helper the breadcrumb text rule uses).
- Replace is span-only (`createNote` rejects a point replace), so the `point` branch is untouched. Comment/delete close markers still return a bare `</span>`.

The injected span has **no `.mw-run` breadcrumb** (no `data-s`/`data-e`): it is inert display text, never a selection/anchor target for a new note - correct, because it is not in the file.

## 5. Styling (`src/preview/assets/app.css`)
This **flips** today's committed look so the original reads as the thing being replaced and the replacement reads as the suggestion (mirroring compose, but static):

- **Original** (`.mw-revealed .mw-span.mw-type-replace`): change from blue tint + underline to **muted strikethrough** - `text-decoration: line-through; text-decoration-color: var(--mw-muted); color: var(--mw-muted);` (the same treatment as the compose `.mw-replace-target`, deliberately not delete-red).
- **Replacement** (`.mw-revealed .mw-replace-text`): the committed-suggestion look - `background: var(--mw-replace); text-decoration: underline; text-decoration-color: var(--mw-replace-line);` plus the small radius/padding the compose field used, but **no** `contenteditable`, outline, or caret - it is static, inert text.
- **Clean-mode invariant (crucial):** `.mw-replace-text` is `display: none` by default and only `display: inline` under `.mw-revealed`. The server always emits the span; the client body class decides visibility. In clean mode the column therefore shows the pure file (original un-struck, no injected replacement). This is what keeps the reading surface equal to the file.
- **Active state:** `.mw-revealed .mw-replace-text.active` (and the existing `.mw-type-replace.active`) deepen to `var(--mw-replace-deep)`, so activating the card highlights the original+replacement pair together.
- Verify legibility in **Dark / Light / Sepia** (all four tokens - `--mw-muted`, `--mw-replace`, `--mw-replace-line`, `--mw-replace-deep` - already exist per theme).

## 6. The rail card
Unchanged. It still renders `mw-type-replace` with the `replace` label, the quoted replacement snippet (`noteSnippet`), and Reply / Resolve / x. The snippet is now mildly redundant with the inline text but is kept (it aids scanning the rail and matches the comment/delete cards); no `renderRail` change.

## 7. Edge cases
- **Long replacement:** reflows the line, the same accepted cost as compose; the reading column width/position is unchanged (Principle 1).
- **Adjacent / multiple suggestions:** each renders its own struck-original + inline replacement side by side; no special handling.
- **Escaping:** `note.text` is HTML-escaped as content; quotes/`<`/`&` are safe.
- **Clean toggle:** flipping to clean hides every `.mw-replace-text` and un-strikes the originals (CSS only - no re-fetch).
- **Distinct from compose:** the committed replacement is static text (no field chrome, not editable); it looks like the compose replacement but cannot be typed into. A new compose can still be started elsewhere.

## 8. Testing
- **`test/preview/render.test.ts`:** an open `replace` note renders the original wrapped in `<span class="mw-span mw-type-replace" data-mw-id=...>` immediately followed by `<span class="mw-replace-text" data-mw-id=...>` containing the escaped replacement; the replacement text is HTML-escaped; a `comment`/`delete` close still emits a bare `</span>` (no `.mw-replace-text`). Update any existing replace-render assertion that expected the blue-underline-on-original.
- **Regression:** the full suite stays green (this touches only `render.ts` + `app.css`; transform/server/compose tests are unaffected).
- **Live (Playwright, `/tmp` copy of `playground.md`, never `sample.md`), all three themes:** commit a replace -> the original shows muted-struck with the replacement inline right after it (matching what was just typed), and the rail card still shows it; toggle to **clean** -> the column shows the pure file (no replacement, original un-struck); toggle back -> it returns; click the card/word -> original+replacement highlight together; **x discard** -> the original prose is restored; lint stays clean.

## 9. Success criteria
A committed, open replace suggestion shows - in revealed mode, across Dark/Light/Sepia - the original struck-through with the proposed replacement inline immediately after it, exactly as it appeared during compose, while the rail card continues to show the replacement. Switching to clean (reading) mode shows the document exactly as the file reads (no injected replacement, original un-struck). Discarding restores the original prose. The file, the protocol, and the stored record are unchanged, and the document lints clean throughout.
