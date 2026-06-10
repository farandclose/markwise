# Markwise previewer - discard (x) on comment cards

Date: 2026-06-10. Parent spec: `2026-06-07-previewer-suggest-delete-design.md` (which introduced `discardNote`, the `/discard` endpoint, and the card-scoped confirm overlay, and deliberately built the transform type-agnostically while surfacing the x on suggestion cards only). Related: PRODUCT.md Principle 3 (the tool disappears), decision D42.

## 1. Context and goal

Today the x discard button renders on delete, replace, and insert cards only. A comment card offers Reply and Resolve - so a comment posted by mistake can only be Resolved, which writes a permanent archive record for something the reviewer simply wants gone.

Goal: render the same x on comment cards. Confirmed with the product owner 2026-06-10 (Option A of three): **x always means "take it back, erase completely"; Resolve always means "addressed, keep a record"** - one consistent rule across all four card types, matching the Google-Docs distinction between deleting your own comment and resolving a thread.

Out of scope, verified already done: the second half of roadmap item B (the H1 title marker leak) shipped 2026-06-07 in `51d478c` (`firstH1` strips markers, tested) - re-verified live 2026-06-10.

## 2. Semantics

- **x (discard):** erases the note - markers stripped from the prose, log record dropped, **no archive record**. The document highlight and the rail card both disappear. As if the note never existed.
- **Resolve:** unchanged - archives the note (record moves to `mw:archive`), strips markers.
- A comment whose thread already has replies can still be discarded; the whole thread is erased. This matches suggestion cards today (they can carry replies too) and is guarded by the same confirm step.

## 3. The change (client-only)

The backend needs nothing: `discardNote` (`src/preview/mutate.ts`) is type-agnostic by design, and `POST /api/note/:id/discard` already accepts any note id.

In `src/preview/assets/app.js`:

1. **`renderRail`:** remove the `note.type === 'delete' || 'replace' || 'insert'` gate so every card gets the x. The button's `title`/`aria-label` become type-aware: "Discard this comment" on comment cards, "Discard this suggestion" on the other three.
2. **`openDiscardConfirm`:** accepts the noun ("comment" or "suggestion") and uses it in the prompt and `aria-label`: "Remove this comment?" / "Remove this suggestion?". Behavior is otherwise untouched: card-scoped scrim, Cancel pre-focused, Esc backs out, Remove POSTs `/discard` and the rail repaints via `load()`.

No CSS change: `.mw-card-discard`, `.mw-discard-overlay`, and friends are not type-scoped.

## 4. Principle fit

- **Principle 1 (the document never moves):** untouched - discard already repaints via `load()`; a discarded comment's highlight unwraps exactly as a discarded suggestion's does.
- **Principle 3 (the tool disappears):** improved - mistaken comments no longer leave permanent archive residue, and the rail vocabulary stays at two verbs (x = eraser, Resolve = filing cabinet) instead of growing a third.
- **In-file truth:** preserved - discard is an existing file-level transform; this slice only exposes it for one more note type.

## 5. Testing

Per project convention, `app.js` has no unit tests; the existing vitest coverage of `discardNote` already exercises comment-type notes (the transform is generic). Verification is live via Playwright on a fresh `/tmp` doc, across Dark/Light/Sepia:

1. x renders on a comment card; tooltip reads "Discard this comment".
2. Click x -> confirm overlay says "Remove this comment?"; Cancel and Esc back out leaving the note intact.
3. Confirm Remove -> card and document highlight disappear; the on-disk file has no marker, no log record, and **no archive record** for that id; lint passes.
4. Resolve on a comment still archives (record present in `mw:archive`).
5. Regression: x on a delete/replace/insert card still reads "suggestion" and still discards.
