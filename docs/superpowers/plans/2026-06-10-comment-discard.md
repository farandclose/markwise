# Discard (x) on Comment Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the existing x discard button on comment cards too, with type-aware wording, so a mistaken comment can be erased (no archive record) instead of only resolved.

**Architecture:** Client-only. The backend (`discardNote` transform, `POST /api/note/:id/discard`) is already type-agnostic and fully tested, including on comment-type notes with replies. The only gate is an `if` on `note.type` in `renderRail` in `src/preview/assets/app.js`; remove it and thread a noun ("comment" / "suggestion") into the button and the confirm overlay copy. Spec: `docs/superpowers/specs/2026-06-10-previewer-comment-discard-design.md`.

**Tech Stack:** Vanilla JS (`src/preview/assets/app.js`, an IIFE, no build step for logic - but `npm run build` copies assets to `dist/preview/assets/`). vitest for the (unchanged) backend suite. Playwright (MCP tools) for live verification.

---

### Task 1: Type-aware x on every card (`app.js`)

`app.js` has **no unit tests by project convention** - the safety net is the unchanged 163-test backend suite (regression) plus Task 2's live verification. So this task is edit -> suite green -> typecheck -> build -> commit.

**Files:**
- Modify: `src/preview/assets/app.js` (two spots: `openDiscardConfirm` ~line 97-146, `renderRail` ~line 162-174)

- [ ] **Step 1: Make `openDiscardConfirm` noun-aware**

In `src/preview/assets/app.js`, the function currently reads (leading comment included):

```js
  // The x on a delete card opens a card-scoped confirm: a slight scrim over the card's own content
  // with the prompt centered on top (no reflow of the doc or other cards; never a browser confirm()
  // dialog). Remove -> discard the note (restores the prose); Cancel/Esc -> back out.
  function openDiscardConfirm(card, id) {
    if (card.querySelector('.mw-discard-overlay')) return;
    var overlay = document.createElement('div');
    overlay.className = 'mw-discard-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-label', 'Remove this suggestion?');
    var q = document.createElement('p');
    q.className = 'mw-discard-q';
    q.textContent = 'Remove this suggestion?';
```

Change exactly those lines to (everything after `q.textContent` stays untouched):

```js
  // The x on a card opens a card-scoped confirm: a slight scrim over the card's own content
  // with the prompt centered on top (no reflow of the doc or other cards; never a browser confirm()
  // dialog). Remove -> discard the note (restores the prose); Cancel/Esc -> back out. `noun` is
  // "comment" or "suggestion" so the copy names what is being erased.
  function openDiscardConfirm(card, id, noun) {
    if (card.querySelector('.mw-discard-overlay')) return;
    var overlay = document.createElement('div');
    overlay.className = 'mw-discard-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-label', 'Remove this ' + noun + '?');
    var q = document.createElement('p');
    q.className = 'mw-discard-q';
    q.textContent = 'Remove this ' + noun + '?';
```

- [ ] **Step 2: Remove the type gate in `renderRail`**

Still in `src/preview/assets/app.js`, `renderRail` currently has:

```js
      if (note.type === 'delete' || note.type === 'replace' || note.type === 'insert') {
        const discardBtn = document.createElement('button');
        discardBtn.type = 'button';
        discardBtn.className = 'mw-card-discard';
        discardBtn.title = 'Discard this suggestion';
        discardBtn.setAttribute('aria-label', 'Discard this suggestion');
        discardBtn.textContent = '×';
        discardBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          openDiscardConfirm(card, note.id);
        });
        head.appendChild(discardBtn);
      }
```

Replace the whole block (gate removed, noun threaded through) with:

```js
      const noun = note.type === 'comment' ? 'comment' : 'suggestion';
      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'mw-card-discard';
      discardBtn.title = 'Discard this ' + noun;
      discardBtn.setAttribute('aria-label', 'Discard this ' + noun);
      discardBtn.textContent = '×';
      discardBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openDiscardConfirm(card, note.id, noun);
      });
      head.appendChild(discardBtn);
```

- [ ] **Step 3: Run the backend suite (regression - no test touches app.js)**

Run: `npm test`
Expected: 163 passing, 0 failing.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: both exit 0 (the build copies the edited `app.js` into `dist/preview/assets/`, which Task 2's live server serves).

- [ ] **Step 5: Commit**

```bash
git add src/preview/assets/app.js
git commit -m "feat(preview): discard (x) on comment cards, type-aware copy

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Live Playwright verification (CONTROLLER ONLY - do not delegate)

Per project process, browser verification is driven directly by the main/controller agent, not a subagent. No color measurements are needed in this task, so the `* { transition: none !important }` injection gotcha does not apply.

**Files:** none modified. Creates the scratch doc `/tmp/mw-comment-discard.md` (never test on the shared `sample.md` or `playground.md`).

- [ ] **Step 1: Write the fixture doc (pre-validated, hashes already correct)**

```bash
cat > /tmp/mw-comment-discard.md <<'EOF'
# Comment Discard Check

Ships by <!-- mw:c1 -->Q3<!-- /mw:c1 -->.

Also <!-- mw:c2 -->this phrase<!-- /mw:c2 --> here.

Remove <!-- mw:d1 -->this bit<!-- /mw:d1 --> now.

Swap <!-- mw:r1 -->old<!-- /mw:r1 --> word.

End of doc.<!-- mw:i1 -->

<!-- mw:log v=1
{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"9fc58f1a","before":"by ","after":"."},"thread":[{"by":"reviewer","at":"2026-06-10T09:00:00Z","body":"Is Q3 confirmed?"},{"by":"agent","at":"2026-06-10T09:05:00Z","body":"Checking with the team."}]}
{"id":"c2","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"c39300dd","before":"Also ","after":" here"},"thread":[{"by":"reviewer","at":"2026-06-10T09:01:00Z","body":"Resolve me to test archiving."}]}
{"id":"d1","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"7c37998f","before":"Remove ","after":" now"},"thread":[]}
{"id":"r1","type":"replace","state":"open","disp":"none","text":"new","anchor":{"kind":"span","hash":"cba06b57","before":"Swap ","after":" word"},"thread":[]}
{"id":"i1","type":"insert","state":"open","disp":"none","text":" The inserted sentence.","anchor":{"kind":"point","before":"doc.","after":""},"thread":[]}
-->
EOF
node dist/cli.js lint --strict /tmp/mw-comment-discard.md
```

Expected: `clean`, `0 errors, 0 warnings`, exit 0. (This exact content was validated 2026-06-10; thread `by` must be `reviewer`/`agent`, and the hashes above are the lint-fixed values.)

- [ ] **Step 2: Start the previewer**

Run (in background): `node dist/cli.js preview /tmp/mw-comment-discard.md`
Expected: prints `http://localhost:<port>`. Navigate Playwright to that URL. The rail shows 5 cards: comment c1, comment c2, delete d1, replace r1, insert i1.

- [ ] **Step 3: x renders on comment cards, with the right words**

On the c1 card (`.mw-card.mw-type-comment[data-mw-id="c1"]`): a `button.mw-card-discard` exists with `title` and `aria-label` `Discard this comment`. On the d1/r1/i1 cards the button still says `Discard this suggestion` (regression).

- [ ] **Step 4: Cancel and Esc back out, note intact**

Click c1's x -> the card shows `.mw-discard-overlay` with text `Remove this comment?` and the Cancel button focused. Click Cancel -> overlay gone, card intact. Click x again -> press Escape -> overlay gone. Confirm `/tmp/mw-comment-discard.md` still contains `mw:c1`.

- [ ] **Step 5: Remove erases - no archive**

Click c1's x -> click Remove. Expected: c1's card leaves the rail (count drops to 4) and the `Q3` highlight in the doc unwraps. On disk: the file contains no `mw:c1` marker, no `"id":"c1"` record, and **no `mw:archive` block** (c1 is erased, not archived); `node dist/cli.js lint --strict /tmp/mw-comment-discard.md` is still clean. Note: discarding c1 erases its agent reply too - that is the approved semantics (the confirm guards it).

- [ ] **Step 6: Resolve still archives**

Click Resolve on the c2 card. Expected: card leaves the rail; on disk c2's markers are stripped but an `mw:archive` block now exists containing `"id":"c2"`. (This proves x and Resolve stayed distinct.)

- [ ] **Step 7: Suggestion discard regression**

Click d1's x -> overlay reads `Remove this suggestion?` -> Remove. Expected: d1 erased from rail and disk, `this bit` restored as plain prose, lint still clean.

- [ ] **Step 8: All three themes**

Via the theme picker, switch Dark -> Light -> Sepia. In each theme the remaining cards (r1, i1) show the x and a comment-free rail renders normally. (Structural check only; no color assertions.)

- [ ] **Step 9: Cleanup**

Stop the preview server. No commit (nothing changed in the repo).
