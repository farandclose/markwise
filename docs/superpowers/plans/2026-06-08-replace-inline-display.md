# Inline display of a committed replace suggestion - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a committed, open `replace` suggestion render the original struck-through with the proposed replacement inline right after it (the Google-Docs Suggesting look it already shows during compose), in revealed mode only; clean read mode still shows the pure file.

**Architecture:** Render-only change. `src/preview/render.ts` (`convertMarker`) emits the replacement text - read from the open note's record - as a sibling `<span class="mw-replace-text">` immediately after the struck original's closing `</span>`. `src/preview/assets/app.css` flips the committed-replace styling (original -> muted strikethrough; the new replacement span -> blue tint + underline) and hides the replacement span in clean mode. No change to the file, the `mw:log` record, `POST /api/note`, `createNote`/`discardNote`, or the compose interaction.

**Tech Stack:** TypeScript (Node http server, no framework), markdown-it renderer with offset breadcrumbs, Vitest, vanilla browser CSS. Three themes (Dark/Light/Sepia) via CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-06-08-previewer-replace-inline-display-design.md`. Branch: `feat/replace-inline-display`.

---

## File Structure

- **Modify** `src/preview/render.ts` - in `convertMarker`, the close-marker branch: for an open `replace` note with non-empty `text`, return `</span>` plus a sibling `<span class="mw-replace-text" data-mw-id=...>` carrying the HTML-escaped replacement. Comment/delete/insert close plainly (unchanged).
- **Modify** `test/preview/render.test.ts` - add cases for the inline replacement (present for replace, escaped, absent for delete/insert/resolved).
- **Modify** `src/preview/assets/app.css` - flip `.mw-type-replace` to muted strikethrough; add `.mw-replace-text` (hidden by default, blue tint + underline when revealed, deeper when active).

Order: render (Task 1, unit-tested) -> styling (Task 2, visually verified) -> full verification + finish (Task 3). Task 2 depends on Task 1; the live view is only visually correct after Task 2.

No `DECISIONS.md`, protocol, transform, or server change: this is purely how an open replace is rendered.

---

## Task 1: Render the replacement inline (`render.ts`)

**Files:**
- Modify: `src/preview/render.ts` (the `convertMarker` function, the `if (isClose)` branch ~line 64)
- Test: `test/preview/render.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this block to `test/preview/render.test.ts` (after the last `describe(...)` block, at the end of the file). It reuses the imported `renderDocumentHtml` and the existing module-level `DOC` fixture (which already contains an open replace `s1` wrapping `Q3` with `"text":"Q4"`, an insert point `s2`, and a delete `s3`).

```typescript
describe('renderDocumentHtml: committed replace shows its replacement inline', () => {
  it('emits the replacement as a sibling span right after the struck original', () => {
    const html = renderDocumentHtml(DOC);
    // s1 wraps "Q3" and proposes "Q4": the original span closes, then the replacement span follows.
    expect(html).toContain('</span><span class="mw-replace-text" data-mw-id="s1">Q4</span>');
  });

  it('emits a replacement span only for replace notes (not delete or insert)', () => {
    const html = renderDocumentHtml(DOC);
    const count = (html.match(/class="mw-replace-text"/g) || []).length;
    expect(count).toBe(1); // only s1 (replace); s2 (insert) and s3 (delete) get none
    expect(html).not.toContain('data-mw-id="s3"><'); // delete close stays a plain </span>
  });

  it('HTML-escapes the replacement text', () => {
    const src = [
      '# T',
      '',
      'Use <!-- mw:r1 -->X<!-- /mw:r1 -->.',
      '',
      '<!-- mw:log v=1',
      '{"id":"r1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"Use ","after":"."},"text":"a < b & c","thread":[]}',
      '-->',
      '',
    ].join('\n');
    const html = renderDocumentHtml(src);
    expect(html).toContain('<span class="mw-replace-text" data-mw-id="r1">a &lt; b &amp; c</span>');
  });

  it('does not emit a replacement span for a resolved replace (not open)', () => {
    const src = [
      '# T',
      '',
      'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
      '',
      '<!-- mw:log v=1',
      '{"id":"s1","type":"replace","state":"resolved","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}',
      '-->',
      '',
    ].join('\n');
    expect(renderDocumentHtml(src)).not.toContain('mw-replace-text');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/render.test.ts`
Expected: the first three new tests FAIL (the close marker currently returns a bare `</span>`, so no `mw-replace-text` span is emitted - the `toContain` assertions fail, and the count is `0` not `1`). The resolved-replace test passes already (a resolved note is not open, so nothing is emitted). All pre-existing render tests stay green.

- [ ] **Step 3: Implement - emit the replacement on the close marker**

In `src/preview/render.ts`, the `convertMarker` function has already resolved the note (`const note = env.openById.get(id); if (!note) return raw;`). Replace the single close-marker line:

```typescript
  if (isClose) return '</span>';
```

with:

```typescript
  if (isClose) {
    // A committed, open replace shows its proposed text inline, right after the struck original
    // (spec 2026-06-08-previewer-replace-inline-display). The text lives in the note record, not the
    // prose; it is escaped as content here and hidden in clean read mode by CSS. The replacement span
    // carries the same data-mw-id so it activates with - and highlights alongside - the original.
    // Comment/delete/insert (and replace with no text) close plainly.
    if (note.type === 'replace' && note.text) {
      return `</span><span class="mw-replace-text" data-mw-id="${escapeAttr(id)}">${md.utils.escapeHtml(note.text)}</span>`;
    }
    return '</span>';
  }
```

(`md` is the module-level markdown-it instance; `md.utils.escapeHtml` is the same content-escape the breadcrumb text rule uses. `convertMarker` only runs during `renderDocumentHtml`, after `md` is initialized, so the reference is safe.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/preview/render.test.ts`
Expected: PASS - the four new tests plus all pre-existing render tests (the open-span, breadcrumb, point-note, drop-log, resolved, and marker-in-code tests are unaffected; only the close marker for an open replace changed).

- [ ] **Step 5: Commit**

```bash
git add src/preview/render.ts test/preview/render.test.ts
git commit -m "$(cat <<'EOF'
feat(render): show a committed replace's proposed text inline

An open replace note now renders the proposed replacement as a sibling
<span class="mw-replace-text"> right after the struck original's closing
tag, escaped and carrying the note's data-mw-id. The text comes from the
note record - the file and prose are unchanged. Comment/delete/insert
close plainly. Styling (and clean-mode hiding) lands in the next task.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

Note: after this task, the live preview will show the replacement text as unstyled inline text in both modes (e.g. "Q3 Q4") - that is expected; Task 2 adds the styling and the clean-mode hide.

---

## Task 2: Style the inline replacement (`app.css`)

**Files:**
- Modify: `src/preview/assets/app.css` (the revealed/clean treatments around lines 318-344)

CSS is verified visually (Playwright + manual), per the previewer precedent - no unit test. Steps 1-3 are edits; Step 4 builds + type-checks; Step 5 is the visual gate; Step 6 commits.

- [ ] **Step 1: Flip the original's committed style to a muted strikethrough**

In `src/preview/assets/app.css`, change the replace-span rule (currently line 324):

```css
.mw-revealed .mw-span.mw-type-replace { background: var(--mw-replace); text-decoration: underline; text-decoration-color: var(--mw-replace-line); }
```

to (the original becomes the struck "thing being replaced" - muted, deliberately not delete-red; the blue tint + underline moves to the replacement span in Step 2):

```css
.mw-revealed .mw-span.mw-type-replace { text-decoration: line-through; text-decoration-color: var(--mw-muted); color: var(--mw-muted); }
```

- [ ] **Step 2: Add the inline replacement span styling**

In `src/preview/assets/app.css`, immediately after the delete rule (line 325, `.mw-revealed .mw-span.mw-type-delete  { ... }`), add:

```css

/* Committed replace: the proposed replacement, rendered inline right after the struck original
   (spec 2026-06-08-previewer-replace-inline-display). Hidden in clean read mode so the reading
   column still equals the file; shown only when notes are revealed. It echoes the compose field's
   tint + underline but is static text - not editable, no caret. */
.mw-replace-text { display: none; }
.mw-revealed .mw-replace-text {
  display: inline;
  background: var(--mw-replace);
  color: var(--mw-ink);
  text-decoration: underline;
  text-decoration-color: var(--mw-replace-line);
  border-radius: 3px;
  padding: 0 2px;
  margin-left: 3px;
}
```

- [ ] **Step 3: Add the active-state highlight for the replacement**

In `src/preview/assets/app.css`, immediately after the active replace-span rule (line 342, `.mw-revealed .mw-span.mw-type-replace.active { background: var(--mw-replace-deep); }`), add:

```css
.mw-revealed .mw-replace-text.active { background: var(--mw-replace-deep); }
```

(The existing line 342 stays: when the note is active, the struck original also takes the deeper band, so the pair highlights together. Both the original span and the replacement span carry the note's `data-mw-id`, and `activate()` adds `.active` to every element with that id, so this works without any JS change.)

- [ ] **Step 4: Build and type-check**

Run: `npm run build` (runs `tsc -p tsconfig.json` + `node scripts/copy-preview-assets.mjs`, copying the edited `app.css` into `dist/preview/assets/`).
Expected: succeeds, exit 0. Confirm `dist/preview/assets/app.css` contains `mw-replace-text` (e.g. `grep -c mw-replace-text dist/preview/assets/app.css` returns 3).

- [ ] **Step 5: Verify in the real preview (Playwright + manual), all three themes**

Build is done in Step 4. Serve a throwaway copy (NEVER the shared `sample.md`):

```bash
cp playground.md /tmp/mw-inline-test.md
node dist/cli.js preview /tmp/mw-inline-test.md
```

Then, in **Dark, Light, and Sepia** (pick from the in-preview theme menu), verify:

- Select a word, type a replacement, press **Enter** to commit. The reading column now shows the **original struck-through (muted, not red)** with the **replacement inline right after it** (blue tint + underline) - matching what it looked like while typing. The rail still shows the `replace` card with the replacement snippet.
- Toggle to **clean** (the counter/reveal toggle): the column shows the **pure file** - the original un-struck and the inline replacement gone. Toggle back to revealed: the struck original + inline replacement return.
- Click the word or its card: the **original and the inline replacement highlight together** (deeper band).
- Click the card's **x -> Remove**: the suggestion is discarded and the original prose is restored (no struck text, no inline replacement).
- A **long** replacement reflows the line; the reading column's left edge/width does not move (Principle 1). A second replace elsewhere renders its own struck-original + inline replacement independently.
- Confirm `node dist/cli.js lint /tmp/mw-inline-test.md` reports no errors after a commit and after a discard.

Fix any issue and re-verify before committing.

- [ ] **Step 6: Commit**

```bash
git add src/preview/assets/app.css
git commit -m "$(cat <<'EOF'
feat(preview): style the inline replacement (struck original + suggestion)

A committed replace now reads like Google-Docs Suggesting mode: the
original is a muted strikethrough and the proposed replacement shows
inline right after it (blue tint + underline), echoing the compose look
but static. The replacement is hidden in clean read mode so the column
still equals the file, and highlights with the original when active.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Full verification + finish

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: all green, including the new render tests and the pre-existing suite (no regressions - this touched only `render.ts` + `app.css`; transform/server/compose/handoff tests are unaffected).

- [ ] **Step 2: Type-check / build**

Run: `npx tsc -p .`
Expected: no type errors.

- [ ] **Step 3: Final real-preview smoke (all three themes)**

Re-run the Task 2 Step 5 verification once more end-to-end on a fresh `/tmp` copy of `playground.md`, confirming the spec's success criteria: a committed replace shows the struck original + inline replacement in revealed mode across Dark/Light/Sepia; clean mode shows the pure file; discard restores the prose; the file lints clean and is unchanged apart from the suggestion's markers + record.

- [ ] **Step 4: Finish the branch**

Use **superpowers:finishing-a-development-branch** to complete `feat/replace-inline-display`: verify tests, then (per the user's choice, mirroring the prior slices) merge to `main` and push.

---

## Self-Review (completed while writing)

**Spec coverage:** struck original + inline replacement, revealed-only (Task 1 render + Task 2 Steps 1-2 styling) · clean mode hides it / column equals the file (Task 2 Step 2 `display:none` default + Step 5 verify) · render-only, no file/protocol/transform change (Task 1 only touches `convertMarker`'s close branch; no other files) · replacement carries `data-mw-id` so it activates/highlights with the original (Task 1 markup + Task 2 Step 3, confirmed against `activate()` which targets every `[data-mw-id]`) · rail card unchanged (no `renderRail`/payload change) · HTML-escaping (Task 1 Step 1 escape test + Step 3 `md.utils.escapeHtml`) · all three themes (Task 2 Step 5, Task 3 Step 3) · never on `sample.md` (Task 2 Step 5 uses a `/tmp` copy).

**Placeholder scan:** none - every code step shows complete code; every run step gives the command and expected result.

**Type/name consistency:** the close branch reads `note.type === 'replace'` and `note.text` (`NoteView.text?: string`, `src/preview/types.ts:11`); the emitted class `mw-replace-text` and the `data-mw-id` attribute match the CSS selectors in Task 2 and the existing `activate()`/`idSel` lookups; `md.utils.escapeHtml` and `escapeAttr` are both already used in `render.ts`. The committed-replace style flip (original muted-strike, replacement blue+underline) is internally consistent across Task 2 Steps 1-3 and uses tokens (`--mw-muted`, `--mw-replace`, `--mw-ink`, `--mw-replace-line`, `--mw-replace-deep`) that exist in all three theme blocks.
