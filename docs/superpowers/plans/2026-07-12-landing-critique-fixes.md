# Landing Page Critique Fixes (5 P1s + conversion strip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five P1 issues from the 2026-07-12 design critique of the Markwise landing page and add the agreed conversion content, all inside the single static file `site/index.html` plus one new image asset.

**Architecture:** The landing page is one self-contained static HTML file (`site/index.html`, ~1105 lines: inline CSS in `<head>`, markup, inline JS at the bottom) served by Vercel from the `site/` directory. There is no build step and no test suite for the site; every task therefore ends with a scripted verification (grep assertion, node contrast script, or a Playwright check) instead of unit tests. All work happens on branch `feat/landing-critique-fixes`; nothing is pushed (pushing to main auto-deploys to production).

**Tech Stack:** Plain HTML/CSS/JS (no framework), Playwright (already a repo devDependency, config at `playwright.config.ts`) for browser verification, `sips` (macOS built-in) for image dimensions.

## Global Constraints

- Work on branch `feat/landing-critique-fixes` (created in Task 1). Commit per task. NEVER push. NEVER commit to main.
- The only production files you may modify/create: `site/index.html`, `site/assets/og.png`. Everything else (scripts, scratch HTML) is temporary and must be deleted before the task's commit.
- Copy rules: NO em-dashes anywhere (no `—`, no `--` in prose); this page uses ` - ` (space hyphen space) as its dash convention. No marketing buzzwords. Verb+object button labels.
- The landing page is STANDALONE: it must not link to any internal page (no docs/how-it-works.html, no other repo pages). External links (github.com, npm) are allowed.
- Do NOT change the hero paste-card button hierarchy (`.paste-cta` "Copy prompt" stays `btn-soft`; this demotion was a deliberate, user-approved decision so the H1 owns first fixation).
- Do NOT "neutralize" the warm sepia paper surfaces (`--paper` world). Contrast fixes darken text ON those surfaces; the surfaces themselves stay exactly as they are.
- Do NOT touch the red strike-through diff colors (`--red`, `--red-soft`) except the single `.fraw .id` token named in Task 5. The soft red strike is deliberate diff language.
- WCAG target for changed/added text: >= 4.5:1 contrast, computed with the WCAG relative-luminance formula.
- Preserve the reduced-motion, no-JS, and mobile (<881px) fallback behaviors exactly as they are.
- End every commit message with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Verification scripts that import `@playwright/test` MUST be saved in the REPO ROOT (Node resolves packages relative to the script's location, so `/tmp` cannot see the repo's `node_modules`), named `_mw-verify-*.mjs`, run from the repo root, and deleted immediately after use (they are never committed; commits `git add` explicit paths only).

## Reference: WCAG contrast helper (used by Tasks 5 and 6)

Save as `/tmp/mw-contrast.mjs` when a task calls for it (delete after use; never commit):

```js
const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
const lum = hex => { const h=hex.replace('#',''); const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); };
const ratio = (fg,bg) => { const [a,b]=[lum(fg),lum(bg)].sort((x,y)=>y-x); return ((a+0.05)/(b+0.05)); };
const pairs = [
  // [label, fg, bg, min]
  ['paper-title on titlebar', '#5a4e28', '#ddca9f', 4.5],
  ['paper-soft (.mk/.hash) on paper', '#635733', '#e7d7b2', 4.5],
  ['gold-text on card', '#7a570f', '#f3e8cd', 4.5],
  ['gold-text (.k) on paper', '#7a570f', '#e7d7b2', 4.5],
  ['green-text on card', '#2e5c3a', '#f3e8cd', 4.5],
  ['green-text (.v) on paper', '#2e5c3a', '#e7d7b2', 4.5],
  ['green-text on chip-over-paper', '#2e5c3a', '#dad0aa', 4.5],
  ['green-text on foot-chip', '#2e5c3a', '#eef2f0', 4.5],
  ['red-deep (.id) on paper', '#963a2b', '#e7d7b2', 4.5],
];
let fail = 0;
for (const [label, fg, bg, min] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${r.toFixed(2)} (need ${min})`);
}
process.exit(fail ? 1 : 0);
```

---

### Task 1: Hero settled state restores the subhead; differentiator lands in the fold

**Files:**
- Modify: `site/index.html` (hero copy ~lines 560-575; hero animation JS ~lines 1049-1090)

**Interfaces:**
- Produces: after the hero animation completes, `.hero` no longer carries `is-animating`, so the static three-line `.sub` subhead is visible again (CSS already handles this; only JS changes). Task 6 verifies this live.

**Background (why):** `.hero.is-animating .sub{display:none}` hides the subhead during the ~17s narrated hero show, but `play()` never removes `is-animating`, so on desktop the subhead stays hidden forever, including for screen readers. Decision already made by the product owner: restore the subhead AFTER the show only (the caption-led narration during the show stays exactly as is). Additionally the core differentiator ("saved inside the file") is missing from the fold copy.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/saurabhmehta/Documents/imagineandbuild/markwise
git checkout -b feat/landing-critique-fixes
```

- [ ] **Step 2: Add the differentiator to the subhead and to caption 3 (they must stay in sync)**

In `site/index.html`, replace:

```html
        <p class="sub">Your agent writes the doc.<br>You comment and suggest edits on the exact text.<br><b>Your agent reads every note, acts, and answers.</b></p>
```

with:

```html
        <p class="sub">Your agent writes the doc.<br>You comment and suggest edits on the exact text.<br><b>Your agent reads every note, acts, and answers - saved inside the file.</b></p>
```

And replace:

```html
          <span class="hcap" data-i="2">Your agent reads every note, acts, and answers.</span>
```

with:

```html
          <span class="hcap" data-i="2">Your agent reads every note, acts, and answers - saved inside the file.</span>
```

- [ ] **Step 3: End the show by dropping `is-animating` (restores `.sub`, hides the caption track)**

In the hero JS near the bottom of the file, replace:

```js
      at(pressAt + 4250, function(){ win.classList.add('curtain'); });
      at(pressAt + 4850, function(){ win.classList.remove('term-up'); win.setAttribute('data-doc','resolved'); });
      at(pressAt + 5100, function(){ win.classList.remove('curtain'); });
      at(pressAt + 5800, function(){ if(replay) replay.classList.add('show'); });
```

with:

```js
      at(pressAt + 4250, function(){ win.classList.add('curtain'); });
      at(pressAt + 4850, function(){ win.classList.remove('term-up'); win.setAttribute('data-doc','resolved'); });
      at(pressAt + 5100, function(){ win.classList.remove('curtain'); });
      // settle: the show is over - hand the stage back to the static page.
      // Removing is-animating restores the .sub subhead (and returns it to the
      // accessibility tree) and hides the caption track; Replay re-arms everything.
      at(pressAt + 5800, function(){
        hero.classList.remove('is-animating');
        capOut();
        if(replay) replay.classList.add('show');
      });
```

Note: `arm()` already re-adds `is-animating`, so the Replay button keeps working with no further change.

- [ ] **Step 4: Verify statically**

```bash
grep -c "saved inside the file" site/index.html
```
Expected: `3` (meta description already contains one; sub + caption add two).

```bash
grep -n "hero.classList.remove('is-animating')" site/index.html
```
Expected: one match, inside the `pressAt + 5800` callback.

- [ ] **Step 5: Verify live (settled hero shows the subhead)**

Save as `_mw-verify-hero.mjs`, run with `node _mw-verify-hero.mjs`, then delete it:

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file://' + process.cwd() + '/site/index.html');
await page.waitForTimeout(26000); // full show ~20s + margin
const subVisible = await page.locator('.sub').isVisible();
const animating = await page.evaluate(() => document.querySelector('.hero').classList.contains('is-animating'));
const replayVisible = await page.locator('.hero-replay').isVisible();
console.log({ subVisible, animating, replayVisible });
if (!subVisible || animating || !replayVisible) { process.exitCode = 1; }
await browser.close();
```

Expected output: `{ subVisible: true, animating: false, replayVisible: true }`

- [ ] **Step 6: Commit**

```bash
git add site/index.html
git commit -m "fix(site): restore hero subhead after the show; differentiator in fold

The hero never removed is-animating, so the three-line value prop stayed
display:none forever after the narrated demo (including for screen
readers). The show now settles back to the static subhead. Line 3 and
caption 3 gain the in-file differentiator.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Fix the fragmented CTA list, stale install copy, header label, and activation fine print

**Files:**
- Modify: `site/index.html` (header ~line 549, `.agentdoes` CSS ~line 450-457, start section markup ~lines 755-782, modal ~lines 794-810)

**Interfaces:**
- Produces: `.agentdoes li` markup wraps its sentence in a single `<span>`; new classes `.start-alt` and `.start-fine` exist in the start section. Task 6 verifies rendering.

**Background (why):** `.agentdoes li{display:flex}` turns the text nodes around inline `<code>` into separate anonymous flex items, so items 2-3 render as shuffled parallel columns at every width. Item 1 also says the CLI installs "from GitHub" while the actual prompt installs from npm (stale since v0.1.0). The header button says "Install" but opens a paste-prompt modal. The activation card lacks the agreed fine print (free/MIT, Node 20+, what agent-setup does, self-install alternative).

- [ ] **Step 1: Wrap each list item's sentence in one span and fix the npm copy**

Replace:

```html
          <ol class="agentdoes">
            <li>Install the CLI from GitHub (open source, MIT).</li>
            <li>Run <code>markwise agent-setup</code> and read the printed instructions.</li>
            <li>Teach itself the loop: write a doc, open <code>markwise preview</code> for you, then act on every note you leave.</li>
          </ol>
```

with:

```html
          <ol class="agentdoes">
            <li><span>Install the CLI from npm (open source, MIT).</span></li>
            <li><span>Run <code>markwise agent-setup</code> and read the printed instructions.</span></li>
            <li><span>Teach itself the loop: write a doc, open <code>markwise preview</code> for you, then act on every note you leave.</span></li>
          </ol>
```

- [ ] **Step 2: Rename the header CTA**

Replace:

```html
      <button class="btn btn-primary jsonly" type="button" data-open-install>Install</button>
```

with:

```html
      <button class="btn btn-primary jsonly" type="button" data-open-install>Get started</button>
```

- [ ] **Step 3: Add the fine print under the start-section paste card**

Replace:

```html
            <p class="copy-note" aria-live="polite" data-copy-note></p>
          </div>
          <div class="hero-links">
            <a class="btn btn-ghost" href="https://github.com/farandclose/markwise">View on GitHub</a>
          </div>
```

with:

```html
            <p class="copy-note" aria-live="polite" data-copy-note></p>
          </div>
          <p class="start-alt">Prefer to run it yourself? <code>npm i -g markwise</code>, then <code>markwise preview your-doc.md</code>.</p>
          <p class="start-fine">Free and open source, MIT. Needs Node 20+. <code>agent-setup</code> only prints instructions for your agent to read - nothing runs in the background.</p>
          <div class="hero-links">
            <a class="btn btn-ghost" href="https://github.com/farandclose/markwise">View on GitHub</a>
          </div>
```

- [ ] **Step 4: Add the reassurance line to the install modal**

Replace:

```html
    <p class="modal-hint">Paste into Claude Code, Codex, or any coding agent.</p>
```

with:

```html
    <p class="modal-hint">Paste into Claude Code, Codex, or any coding agent.</p>
    <p class="modal-hint">Free and open source, MIT. <code>agent-setup</code> only prints instructions - nothing runs in the background.</p>
```

- [ ] **Step 5: Add CSS for the new fine-print classes**

In the `<style>` block, replace:

```css
  .agentdoes code{font-family:var(--mono);font-size:.86em;color:var(--ink)}
```

with:

```css
  .agentdoes code{font-family:var(--mono);font-size:.86em;color:var(--ink)}
  .start-alt{font-size:.92rem;color:var(--dim);margin:1rem 0 0}
  .start-alt code,.start-fine code{font-family:var(--mono);font-size:.88em;color:var(--ink);
    background:var(--stage-3);padding:.05em .35em;border-radius:5px}
  .start-fine{font-size:.85rem;color:var(--dim);margin:.4rem 0 0;max-width:34em}
  .modal-hint code{font-family:var(--mono);font-size:.88em;color:var(--ink);
    background:var(--stage-3);padding:.05em .35em;border-radius:5px}
```

- [ ] **Step 6: Verify**

```bash
grep -c "from GitHub" site/index.html
```
Expected: `0`

Save as `_mw-verify-list.mjs`, run with `node _mw-verify-list.mjs`, delete after:

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('file://' + process.cwd() + '/site/index.html');
// each li must have exactly 1 element child (the span); the counter is a ::before
const counts = await page.$$eval('.agentdoes li', els => els.map(e => e.children.length));
// the span must not be split: its bounding box left edge must be identical for all text
const spanX = await page.$$eval('.agentdoes li > span', els => els.map(e => Math.round(e.getBoundingClientRect().x)));
console.log({ counts, spanX });
if (counts.some(c => c !== 1)) process.exitCode = 1;
await browser.close();
```

Expected: `counts: [1, 1, 1]` and all three `spanX` values equal.

- [ ] **Step 7: Commit**

```bash
git add site/index.html
git commit -m "fix(site): un-fragment the agent-does list; npm copy; CTA fine print

display:flex made anonymous flex items of the text around inline code,
shredding sentences into parallel columns. Each li now wraps its sentence
in one span. 'Install from GitHub' corrected to npm (stale since v0.1.0).
Header CTA renamed Get started (it opens a paste prompt, not an
installer). Start card and modal gain the agreed fine print: free/MIT,
Node 20+, what agent-setup does, and the self-install alternative.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Scrollytelling: keep the step-5 payoff pinned; remove dead zones

**Files:**
- Modify: `site/index.html` (`.how` CSS ~lines 272-306; IntersectionObserver JS ~lines 903-924)

**Interfaces:**
- Produces: `.how--live .how-steps::after` spacer rule; the observer watches whole `<li class="how-step">` elements instead of their inner text `<div>`s. Task 6 verifies at 1440x900.

**Background (why):** At 1440x900 the sticky stage (`.how-stage`, 100vh) runs out of scroll track before step 5 centers, so the resolved-state window (the section's payoff) clips under the header. Separately, the observer watches each step's small inner text `<div>` with a center-line rootMargin, which leaves dead zones between steps where the stage sits on a stale state.

- [ ] **Step 1: Extend the sticky track (live/desktop mode only)**

In the `<style>` block, replace:

```css
  /* progressive enhancement: dim inactive steps only when scrollytelling is live */
  .how--live .how-step{opacity:.3}
  .how--live .how-step.active{opacity:1}
```

with:

```css
  /* progressive enhancement: dim inactive steps only when scrollytelling is live */
  .how--live .how-step{opacity:.3}
  .how--live .how-step.active{opacity:1}
  /* spacer so the sticky stage stays pinned while the last step crosses center;
     scoped to how--live so mobile/static/reduced-motion get no dead scroll */
  .how--live .how-steps::after{content:"";display:block;height:32vh}
```

- [ ] **Step 2: Observe the whole step, not its text block**

In the JS, replace:

```js
      // observe each step's text (not the tall block) so the window flips when the copy hits center
      steps.forEach(function(s){ var c = s.querySelector('div'); if(c) io.observe(c); });
```

with:

```js
      // observe the whole 44vh step so exactly one step intersects the center
      // band at all times - observing only the text div left dead zones where
      // the stage sat on a stale state between steps
      steps.forEach(function(s){ io.observe(s); });
```

- [ ] **Step 3: Update the observer callback to match (it currently resolves `closest('.how-step')` from the inner div; observing the li directly still works because `closest` on the li returns itself - verify, do not change)**

Read the callback:

```js
            var li = e.target.closest('.how-step');
```

`e.target` is now the `<li class="how-step">` itself; `closest('.how-step')` returns it. No code change needed - this step is a required read-and-confirm.

- [ ] **Step 4: Verify live at 1440x900**

Save as `_mw-verify-how.mjs`, run with `node _mw-verify-how.mjs`, delete after:

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file://' + process.cwd() + '/site/index.html');
await page.waitForTimeout(1500);
// scroll step 5's text to viewport center
await page.$eval('.how-step[data-step="4"]', el =>
  el.scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.waitForTimeout(3500); // let the resolve micro-interaction land
const state = await page.evaluate(() => {
  const win = document.querySelector('.how-win');
  const r = win.getBoundingClientRect();
  const bar = document.querySelector('.bar').getBoundingClientRect();
  return {
    step: win.getAttribute('data-step'),
    topClipped: r.top < bar.bottom,
    bottomClipped: r.bottom > window.innerHeight,
    activeCount: document.querySelectorAll('.how-step.active').length,
  };
});
console.log(state);
if (state.step !== '4' || state.topClipped || state.bottomClipped || state.activeCount !== 1) process.exitCode = 1;
await browser.close();
```

Expected: `{ step: '4', topClipped: false, bottomClipped: false, activeCount: 1 }`

Also scroll the whole section slowly and confirm continuous coverage:

```js
// append to the same script before browser.close() if desired, or run as a second pass:
// for y in section range, assert document.querySelectorAll('.how-step.active').length === 1
```

Concretely: run this second check as `_mw-verify-how2.mjs`, then delete it:

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file://' + process.cwd() + '/site/index.html');
await page.waitForTimeout(1500);
const sec = await page.$eval('.how', el => ({ top: el.offsetTop, h: el.offsetHeight }));
let bad = 0;
for (let y = sec.top; y < sec.top + sec.h - 900; y += 150) {
  await page.evaluate(v => window.scrollTo(0, v), y);
  await page.waitForTimeout(120);
  const n = await page.evaluate(() => document.querySelectorAll('.how-step.active').length);
  if (n !== 1) bad++;
}
console.log({ badFrames: bad });
if (bad > 0) process.exitCode = 1;
await browser.close();
```

Expected: `{ badFrames: 0 }`

- [ ] **Step 5: Commit**

```bash
git add site/index.html
git commit -m "fix(site): pin scrollytelling through step 5; continuous active step

A 32vh spacer (live mode only) keeps the sticky stage pinned while the
final step crosses center, so the resolved-state payoff no longer clips
under the header at 1440x900. The observer now watches whole steps
instead of their text divs, removing the dead zones where no step was
active and the stage lagged on a stale state.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Conversion content: problem strip, objections section, real screenshot, proof row, share metadata + og image

**Files:**
- Modify: `site/index.html` (head meta ~lines 6-10; new CSS; new sections between hero and `.how`, between `.real` and `.start`, and inside `.start`)
- Create: `site/assets/og.png` (1200x630)
- Temporary (delete before commit): `site/_og-card.html`

**Interfaces:**
- Consumes: `.start-alt` / `.start-fine` from Task 2 (placement anchors below reference them).
- Produces: sections `.problem` and `.asks`, elements `.proof-shot` and `.proof-row`, og/twitter/canonical meta tags, asset `site/assets/og.png`. Task 5 recolors nothing inside them (they use existing passing tokens); Task 6 verifies presence.

**Background (why):** The page has no problem statement, no objection handling, no real product image, no social-share card, and no proof signals. All copy below was ported/adapted from README.md (the product's own problem framing and "Why not just..." section) and approved in scope. The canonical domain is `https://markwise.dev`.

- [ ] **Step 1: Add share/canonical metadata to `<head>`**

Replace:

```html
<meta property="og:title" content="Markwise - the review layer for agent-written markdown">
<meta property="og:description" content="Your agent writes the doc. You comment and suggest edits on the exact text. Your agent reads every note, acts, and answers.">
<link rel="icon" type="image/svg+xml" href="brand/markwise-mark.svg">
```

with:

```html
<meta property="og:title" content="Markwise - the review layer for agent-written markdown">
<meta property="og:description" content="Your agent writes the doc. You comment and suggest edits on the exact text. Your agent reads every note, acts, and answers.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://markwise.dev/">
<meta property="og:image" content="https://markwise.dev/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Markwise: the review layer for agent-written markdown. A sentence with a marker highlight, a strikethrough edit, and its green replacement.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Markwise - the review layer for agent-written markdown">
<meta name="twitter:description" content="Your agent writes the doc. You comment and suggest edits on the exact text. Your agent reads every note, acts, and answers.">
<meta name="twitter:image" content="https://markwise.dev/assets/og.png">
<link rel="canonical" href="https://markwise.dev/">
<link rel="icon" type="image/svg+xml" href="brand/markwise-mark.svg">
```

- [ ] **Step 2: Add CSS for the new sections**

In the `<style>` block, replace:

```css
  /* get started */
  .start{border-top:1px solid var(--hairline-soft)}
```

with:

```css
  /* problem: the handoff gap */
  .problem{border-top:1px solid var(--hairline-soft)}
  .moves{list-style:none;margin:0;padding:0}
  .moves li{display:grid;grid-template-columns:minmax(10rem,13rem) 1fr;gap:1.6rem;
    padding:.9rem 0;border-top:1px solid var(--hairline-soft)}
  .moves b{color:var(--ink);font-weight:600;font-size:1rem}
  .moves span{color:var(--dim);font-size:.98rem;line-height:1.6;max-width:38em}

  /* fair questions: objections answered in rows, not cards */
  .asks{border-top:1px solid var(--hairline-soft)}
  .ask-list{margin:0}
  .ask{display:grid;grid-template-columns:minmax(14rem,19rem) 1fr;gap:2rem;
    padding:1.05rem 0;border-top:1px solid var(--hairline-soft)}
  .ask dt{font-family:var(--display);font-weight:700;color:var(--ink);font-size:1.02rem}
  .ask dd{margin:0;color:var(--dim);font-size:.98rem;line-height:1.6;max-width:38em}
  .ask code,.moves code{font-family:var(--mono);font-size:.86em;color:var(--ink);
    background:var(--stage-3);padding:.05em .35em;border-radius:5px}

  /* the real previewer + proof row */
  .proof-shot{margin:clamp(2.4rem,6vh,3.8rem) auto 0;max-width:960px}
  .proof-shot img{display:block;width:100%;height:auto;border:1px solid var(--hairline);
    border-radius:13px;box-shadow:0 14px 44px rgba(23,23,18,.10)}
  .proof-shot figcaption{font-size:.9rem;color:var(--dim);text-align:center;margin:.75rem 0 0}
  .proof-row{font-size:.88rem;color:var(--dim);text-align:center;margin:1.5rem 0 0}

  /* get started */
  .start{border-top:1px solid var(--hairline-soft)}
```

And inside the existing `@media(max-width:880px){` block, replace:

```css
    .real-grid,.start-grid{grid-template-columns:1fr}
```

with:

```css
    .real-grid,.start-grid{grid-template-columns:1fr}
    .moves li,.ask{grid-template-columns:1fr;gap:.3rem}
```

- [ ] **Step 3: Add the problem strip between the hero and the how section**

Replace:

```html
  <section class="how" id="how">
```

with:

```html
  <section class="problem">
    <div class="shell">
      <h2>Your feedback has no way back</h2>
      <p class="lede">Agents hand you long, clean markdown - PRDs, specs, launch plans. Then your notes have to reach the agent, and that handoff is where it falls apart.</p>
      <ul class="moves">
        <li><b>Reply in chat</b><span>and you describe locations in prose: "in section 3, the timeline..." The longer the doc, the worse it gets, and the feedback dies with the session.</span></li>
        <li><b>Edit the file yourself</b><span>and the agent gets no signal: what changed, what is still open, what needs an answer. A raw diff is not a review.</span></li>
      </ul>
    </div>
  </section>

  <section class="how" id="how">
```

- [ ] **Step 4: Add the objections section between `.real` and `.start`**

Replace:

```html
  <section class="start">
```

with:

```html
  <section class="asks">
    <div class="shell">
      <h2>Fair questions</h2>
      <dl class="ask-list">
        <div class="ask"><dt>Why not Google Docs or Notion?</dt><dd>Your doc leaves the repo and the agent loses it - truth moves out of the file. Markwise keeps the review inside the markdown, where the document lives.</dd></div>
        <div class="ask"><dt>Do the markers junk up my file?</dt><dd>Review state hides in HTML comments. GitHub, VS Code, and every normal renderer show the document clean. <code>markwise export</code> writes a copy with every trace stripped; 24 lint rules guard the format.</dd></div>
        <div class="ask"><dt>What does my agent need?</dt><dd>Nothing special. <code>markwise prompt</code> bundles the doc and every open note into a plain-text block any model can read. No plugin, no API, no lock-in.</dd></div>
        <div class="ask"><dt>What are the limits today?</dt><dd>One file per preview, one reviewer, on localhost. A review surface, not a collaboration server. The protocol is v1; <code>markwise lint</code> is the compatibility guarantee.</dd></div>
      </dl>
    </div>
  </section>

  <section class="start">
```

- [ ] **Step 5: Add the real screenshot + proof row at the end of the start section**

First get the image's intrinsic dimensions:

```bash
sips -g pixelWidth -g pixelHeight site/assets/previewer-light.png
```

Note the two numbers; use them as `width` and `height` below (placeholder values `1600`/`1000` shown - replace with the real ones).

Replace:

```html
          </ol>
        </div>
      </div>
    </div>
  </section>

</main>
```

with:

```html
          </ol>
        </div>
      </div>
      <figure class="proof-shot">
        <img src="assets/previewer-light.png" width="1600" height="1000" loading="lazy"
          alt="The Markwise previewer: a launch plan open in the browser with an anchored comment thread and a suggested edit shown inline">
        <figcaption>The real previewer: <code>markwise preview launch-plan.md</code>, on localhost.</figcaption>
      </figure>
      <p class="proof-row">v0.3.0 on npm &middot; MIT license &middot; 160+ unit tests and a browser e2e suite &middot; nothing leaves your machine</p>
    </div>
  </section>

</main>
```

Also add the caption's `code` styling: the `.ask code,.moves code` rule from Step 2 does not cover `figcaption code`. In the `<style>` block, change the selector line added in Step 2 from:

```css
  .ask code,.moves code{font-family:var(--mono);font-size:.86em;color:var(--ink);
```

to:

```css
  .ask code,.moves code,.proof-shot code{font-family:var(--mono);font-size:.86em;color:var(--ink);
```

- [ ] **Step 6: Build the og card and screenshot it**

Create `site/_og-card.html` with exactly:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  @font-face{font-family:'Schibsted Grotesk';font-style:normal;font-weight:400 900;
    src:url(fonts/SchibstedGrotesk-var.woff2) format('woff2')}
  @font-face{font-family:'Literata';font-style:normal;font-weight:400 700;
    src:url(fonts/Literata-var.woff2) format('woff2')}
  *{box-sizing:border-box;margin:0}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{background:#fbfbfc;font-family:'Schibsted Grotesk',sans-serif;
    display:flex;flex-direction:column;justify-content:center;padding:0 96px;gap:40px}
  .lockup{display:flex;align-items:center;gap:18px}
  .lockup img{width:56px;height:56px}
  .lockup span{font-weight:800;font-size:44px;letter-spacing:-.02em;color:#1b1d21}
  .lockup i{font-style:normal;color:#8f671b}
  h1{font-weight:800;font-size:64px;line-height:1.06;letter-spacing:-.03em;color:#1b1d21;max-width:900px}
  h1 .hl{background:rgba(232,176,75,.42);border-radius:6px;padding:0 .12em}
  .doc{font-family:'Literata',Georgia,serif;font-size:30px;line-height:1.6;color:#332b16;
    background:#e7d7b2;border:1px solid #d3bf95;border-radius:14px;padding:28px 36px;max-width:980px}
  .doc .o{background:rgba(176,64,52,.20);color:#b04a3a;text-decoration:line-through;border-radius:4px;padding:0 .1em}
  .doc .n{background:rgba(28,128,71,.18);color:#27502f;border-radius:4px;padding:0 .1em;margin-left:.25em}
</style>
</head>
<body>
  <div class="lockup"><img src="brand/markwise-mark.svg" alt=""><span>markw<i>i</i>se</span></div>
  <h1>The <span class="hl">review layer</span> for agent-written markdown.</h1>
  <p class="doc">We will launch the partner beta in <span class="o">Q4 2026</span><span class="n">H2 2026</span>, with mobile following in the new year.</p>
</body>
</html>
```

Screenshot it (from the repo root; Playwright is a devDependency):

```bash
node -e "
import('@playwright/test').then(async ({ chromium }) => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + process.cwd() + '/site/_og-card.html');
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'site/assets/og.png' });
  await b.close();
});"
```

Then verify and clean up:

```bash
sips -g pixelWidth -g pixelHeight site/assets/og.png   # expect 1200 x 630
ls -la site/assets/og.png                              # expect < 400KB
rm site/_og-card.html
```

- [ ] **Step 7: Verify the page**

```bash
grep -c 'property="og:image"' site/index.html      # expect 1
grep -c 'rel="canonical"' site/index.html          # expect 1
grep -c 'class="ask"' site/index.html              # expect 4
grep -n 'section class="problem"' site/index.html  # expect 1 match, before section class="how"
```

Then render both new sections (save as `_mw-verify-sections.mjs`, run, delete):

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + process.cwd() + '/site/index.html');
  await page.waitForTimeout(1200);
  const ok = await page.evaluate(() => ({
    problem: !!document.querySelector('.problem h2'),
    asks: document.querySelectorAll('.ask').length,
    shot: (() => { const i = document.querySelector('.proof-shot img'); return i && i.naturalWidth > 0; })(),
    proofRow: !!document.querySelector('.proof-row'),
    noHScroll: document.documentElement.scrollWidth <= window.innerWidth,
  }));
  console.log(vp.width, ok, 'consoleErrors:', errors.length);
  if (!ok.problem || ok.asks !== 4 || !ok.shot || !ok.proofRow || !ok.noHScroll || errors.length) process.exitCode = 1;
  await page.close();
}
await browser.close();
```

Expected per viewport: `{ problem: true, asks: 4, shot: true, proofRow: true, noHScroll: true } consoleErrors: 0`

- [ ] **Step 8: Commit**

```bash
git add site/index.html site/assets/og.png
git commit -m "feat(site): problem strip, objections, real previewer, proof row, og card

Ports the README's problem framing and Why-not-just answers onto the
page (problem strip after the hero; Fair questions rows before the CTA),
shows the real previewer screenshot with a proof row (v0.3.0, MIT, test
suite, local-only), and adds og:image/twitter:card/og:url/canonical for
markwise.dev so link unfurls stop shipping bare.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Contrast and microlabel sweep on the sepia surfaces

**Files:**
- Modify: `site/index.html` (`:root` tokens ~line 23-43 and the specific rules listed below)

**Interfaces:**
- Consumes: nothing from other tasks (independent rules), but run AFTER Task 4 so the sweep covers the final page.
- Produces: new tokens `--paper-title`, `--gold-text`, `--green-text`, `--red-deep`. No other task references them.

**Background (why):** PRODUCT.md commits to WCAG AA. Measured failures, all text on the warm sepia surfaces: title-bar text 4.43:1, flip labels 2.59:1, raw-view `<!-- mw: -->` markers 2.94:1, handoff chip ~3.2:1, green chips 3.19-4.37:1, YOU/AGENT microlabels 4.05-4.18:1 at ~9px. The fix darkens TEXT tokens one step; every background stays untouched. All target values below are precomputed to pass (see the contrast helper at the top of the plan).

- [ ] **Step 1: Add the four new text tokens**

Replace:

```css
    --paper:#e7d7b2; --paper-line:#d3bf95; --paper-line-2:#8a7b4f; --paper-ink:#332b16; --paper-soft:#635733;
```

with:

```css
    --paper:#e7d7b2; --paper-line:#d3bf95; --paper-line-2:#8a7b4f; --paper-ink:#332b16; --paper-soft:#635733;
    /* AA text-on-sepia tokens: darkened one step for >=4.5:1; surfaces unchanged */
    --paper-title:#5a4e28; --gold-text:#7a570f; --green-text:#2e5c3a; --red-deep:#963a2b;
```

- [ ] **Step 2: Apply them (exact old -> new for each rule)**

1. Title bar text. Replace:
```css
  .hero-win .win-title{color:#635733;background:#ddca9f;
```
with:
```css
  .hero-win .win-title{color:var(--paper-title);background:#ddca9f;
```

2. YOU label in the hero card (also bump size 8.96px -> 10.56px). Replace:
```css
  .hero-card .who{font-family:var(--mono);font-size:.56rem;letter-spacing:.13em;
    display:block;margin:0 0 .2rem;color:var(--gold-deep)}
```
with:
```css
  .hero-card .who{font-family:var(--mono);font-size:.66rem;letter-spacing:.13em;
    display:block;margin:0 0 .2rem;color:var(--gold-text)}
```

3. Hero handoff chip. Replace:
```css
  .hero-handoff{font-family:var(--sans);font-size:.74rem;font-weight:600;color:var(--green-deep);
```
with:
```css
  .hero-handoff{font-family:var(--sans);font-size:.74rem;font-weight:600;color:var(--green-text);
```

4. Hero addressed chip (9.92px -> 10.88px). Replace:
```css
  .hero-addressed{font-family:var(--mono);font-size:.62rem;letter-spacing:.09em;color:var(--green-deep);
```
with:
```css
  .hero-addressed{font-family:var(--mono);font-size:.68rem;letter-spacing:.09em;color:var(--green-text);
```

5. How-window file name. Replace:
```css
  .hw-file{font-family:var(--mono);font-size:.7rem;color:var(--paper-line-2);letter-spacing:.03em}
```
with:
```css
  .hw-file{font-family:var(--mono);font-size:.7rem;color:var(--paper-title);letter-spacing:.03em}
```

6. How-window handoff button. Replace:
```css
  .hw-handoff{margin-left:auto;font-family:var(--sans);font-size:.68rem;font-weight:600;
    color:var(--dim);background:transparent;border:1px solid var(--hairline);border-radius:7px;
```
with:
```css
  .hw-handoff{margin-left:auto;font-family:var(--sans);font-size:.68rem;font-weight:600;
    color:var(--paper-title);background:transparent;border:1px solid var(--hairline);border-radius:7px;
```

7. Hash marks in doc headings (three rules). Replace:
```css
  .hero-h .hash{font-family:var(--mono);font-size:.72rem;color:var(--paper-line-2);margin-right:.4rem}
```
with:
```css
  .hero-h .hash{font-family:var(--mono);font-size:.72rem;color:var(--paper-soft);margin-right:.4rem}
```
Replace:
```css
  .hw-h .hash{font-family:var(--mono);font-size:.76rem;color:var(--paper-line-2);margin-right:.4rem}
```
with:
```css
  .hw-h .hash{font-family:var(--mono);font-size:.76rem;color:var(--paper-soft);margin-right:.4rem}
```
Replace:
```css
  .fdoc .fh .hash{font-family:var(--mono);font-size:.86rem;color:var(--paper-line-2);margin-right:.45rem}
```
with:
```css
  .fdoc .fh .hash{font-family:var(--mono);font-size:.86rem;color:var(--paper-soft);margin-right:.45rem}
```

8. Card microlabels in the how-window (9.28px -> 10.56px, plus colors). Replace:
```css
  .hw-card .who{font-family:var(--mono);font-size:.58rem;letter-spacing:.13em;display:block;margin:0 0 .22rem}
  .hw-card.you .who{color:var(--gold-deep)}
  .hw-card.agent .who{color:var(--green-deep)}
```
with:
```css
  .hw-card .who{font-family:var(--mono);font-size:.66rem;letter-spacing:.13em;display:block;margin:0 0 .22rem}
  .hw-card.you .who{color:var(--gold-text)}
  .hw-card.agent .who{color:var(--green-text)}
```

9. Resolved chip (10.24px -> 10.88px). Replace:
```css
  .hw-resolved{display:inline-flex;align-items:center;gap:.4rem;font-family:var(--mono);
    font-size:.64rem;letter-spacing:.1em;color:var(--green-deep);background:rgba(63,125,78,.08);
```
with:
```css
  .hw-resolved{display:inline-flex;align-items:center;gap:.4rem;font-family:var(--mono);
    font-size:.68rem;letter-spacing:.1em;color:var(--green-text);background:rgba(63,125,78,.08);
```

10. Flip-card bar: file name and face label. Replace:
```css
  .ffile{color:#635733}
  .flabel{margin-left:auto;font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;
    color:var(--paper-line-2);font-weight:500}
```
with:
```css
  .ffile{color:var(--paper-title)}
  .flabel{margin-left:auto;font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;
    color:var(--paper-title);font-weight:500}
```

11. Raw-face syntax colors (the markers ARE the message). Replace:
```css
  .fraw .mk{color:var(--paper-line-2)}
  .fraw .blk{color:var(--paper-soft)}
  .fraw .k{color:var(--gold-deep)}
  .fraw .v{color:var(--green-deep)}
  .fraw .id{color:var(--red);font-weight:600}
```
with:
```css
  .fraw .mk{color:var(--paper-soft)}
  .fraw .blk{color:var(--paper-soft)}
  .fraw .k{color:var(--gold-text)}
  .fraw .v{color:var(--green-text)}
  .fraw .id{color:var(--red-deep);font-weight:600}
```

12. Footer chip. Replace:
```css
  .foot-chip{display:inline-flex;align-items:center;gap:.45rem;font-family:var(--mono);
    font-size:.68rem;letter-spacing:.1em;color:var(--green-deep);
```
with:
```css
  .foot-chip{display:inline-flex;align-items:center;gap:.45rem;font-family:var(--mono);
    font-size:.68rem;letter-spacing:.1em;color:var(--green-text);
```

Do NOT touch: `--paper-line-2` itself (still used for borders), `--red`/`--red-soft` strike styling in `.an`/`.hero-anchor`/`.hw-anchor` (deliberate diff language, out of scope), `--gold-deep` (still used for fills, borders, focus outline, `.mark i`, copy-note).

- [ ] **Step 3: Verify with the contrast helper**

Save the "Reference: WCAG contrast helper" script from the top of this plan as `/tmp/mw-contrast.mjs`, run:

```bash
node /tmp/mw-contrast.mjs && rm /tmp/mw-contrast.mjs
```

Expected: 9 PASS lines, exit code 0.

Then confirm no rule still uses the old failing combinations:

```bash
grep -n 'color:var(--paper-line-2)' site/index.html
```
Expected: no matches (borders use `border...var(--paper-line-2)` forms or direct hex, which is fine; only `color:` usages had to go).

```bash
grep -c 'font-size:.5[68]rem' site/index.html
```
Expected: `0` (no sub-10px microlabels remain).

- [ ] **Step 4: Commit**

```bash
git add site/index.html
git commit -m "fix(site): AA contrast + legible microlabels on the sepia surfaces

Adds paper-title/gold-text/green-text/red-deep text tokens (darkened one
step, all >=4.5:1 against their actual surfaces, precomputed) and applies
them to title bars, flip labels, raw-view markers and mw:log syntax,
handoff/resolved/footer chips, and the YOU/AGENT microlabels, which also
rise from ~9px to >=10.5px. Surfaces and the red strike diff language are
untouched.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full-page verification pass

**Files:**
- No production changes. Temporary scripts only (delete after).

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Full sweep script**

Save as `_mw-verify-all.mjs`, run with `node _mw-verify-all.mjs`, delete after:

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const results = {};

// Desktop: settled hero, sections, step-5 pin
const d = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
d.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await d.goto('file://' + process.cwd() + '/site/index.html');
await d.waitForTimeout(26000);
results.heroSettled = await d.evaluate(() => {
  const hero = document.querySelector('.hero');
  const sub = document.querySelector('.sub');
  return !hero.classList.contains('is-animating') && getComputedStyle(sub).display !== 'none';
});
// the proof screenshot is loading="lazy" below the fold: scroll it into view
// before checking naturalWidth, or the check false-fails (Task 4 finding)
await d.$eval('.proof-shot img', el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
await d.waitForTimeout(900);
results.sections = await d.evaluate(() => ({
  problem: !!document.querySelector('.problem h2'),
  asks: document.querySelectorAll('.ask').length,
  shot: (() => { const i = document.querySelector('.proof-shot img'); return i && i.naturalWidth > 0; })(),
}));
await d.evaluate(() => window.scrollTo(0, 0));
await d.waitForTimeout(400);
await d.$eval('.how-step[data-step="4"]', el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
await d.waitForTimeout(3500);
results.step5 = await d.evaluate(() => {
  const r = document.querySelector('.how-win').getBoundingClientRect();
  const bar = document.querySelector('.bar').getBoundingClientRect();
  return { step: document.querySelector('.how-win').getAttribute('data-step'),
           clipped: r.top < bar.bottom || r.bottom > window.innerHeight };
});
await d.screenshot({ path: '/tmp/mw-final-desktop-step5.png' });
results.consoleErrors = errs.length;
await d.close();

// Mobile: list integrity, no horizontal scroll
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
await m.goto('file://' + process.cwd() + '/site/index.html');
await m.waitForTimeout(1500);
results.mobile = await m.evaluate(() => ({
  liChildren: [...document.querySelectorAll('.agentdoes li')].map(e => e.children.length),
  noHScroll: document.documentElement.scrollWidth <= window.innerWidth,
  subVisible: getComputedStyle(document.querySelector('.sub')).display !== 'none',
}));
await m.close();
await browser.close();
console.log(JSON.stringify(results, null, 2));
const ok = results.heroSettled && results.sections.problem && results.sections.asks === 4
  && results.sections.shot && results.step5.step === '4' && !results.step5.clipped
  && results.consoleErrors === 0 && results.mobile.liChildren.every(c => c === 1)
  && results.mobile.noHScroll && results.mobile.subVisible;
process.exit(ok ? 0 : 1);
```

Expected: every field true/passing, exit 0.

- [ ] **Step 2: Reduced-motion spot check**

Save as `_mw-verify-rm.mjs`, run, delete after:

```js
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await page.goto('file://' + process.cwd() + '/site/index.html');
await page.waitForTimeout(1200);
const ok = await page.evaluate(() => ({
  subVisible: getComputedStyle(document.querySelector('.sub')).display !== 'none',
  docResolved: document.querySelector('.hero-win').getAttribute('data-doc') === 'resolved',
  howStatic: document.querySelector('.how-win').getAttribute('data-step') === '4',
}));
console.log(ok);
if (!ok.subVisible || !ok.docResolved || !ok.howStatic) process.exitCode = 1;
await browser.close();
```

Expected: `{ subVisible: true, docResolved: true, howStatic: true }`

- [ ] **Step 3: Diff sanity**

```bash
git diff main --stat
```
Expected: exactly two paths: `site/index.html` and `site/assets/og.png` (plus this plan file if it was committed on the branch).

No commit in this task (nothing changed). Report the results.
