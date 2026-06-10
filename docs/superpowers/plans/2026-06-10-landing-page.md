# Markwise Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-page static marketing site at `site/index.html`, deployable to Vercel with zero configuration, per `docs/superpowers/specs/2026-06-10-landing-page-design.md`.

**Architecture:** One self-contained HTML file (inline CSS + vanilla JS, no framework, no build, no external requests), visually derived from `learning/lessons/0001-the-broken-review-loop.html`. A root `vercel.json` serves `site/` as-is and disables the repo's TypeScript build. Verification is browser-based (the repo's unit-test stack does not apply to a static page).

**Tech Stack:** HTML/CSS/vanilla JS, Vercel static hosting.

**Copy rules:** no em-dashes anywhere (plain `-`). All claims must stay honest to the current product (CLI: preview/prompt/status/lint/export; previewer: comments, replies, suggested insert/replace/delete, resolve, three themes).

---

### Task 1: Vercel config

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": null,
  "buildCommand": null,
  "outputDirectory": "site",
  "cleanUrls": true
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore(site): vercel static config serving site/ with no build"
```

### Task 2: Page scaffold + hero

**Files:**
- Create: `site/index.html`

- [ ] **Step 1: Create the scaffold** - `<!DOCTYPE html>`, `<html lang="en">`, meta charset/viewport, `<title>Markwise - the human-agent review layer for markdown</title>`, `<meta name="description" content="Anchored comments, suggested edits, threads, and review state for agent-written markdown - all carried inside the file itself.">`. Copy the `:root` token block from `learning/lessons/0001-the-broken-review-loop.html` (paper/ink/soft/line/accent/accent-soft/card/strike/good/good-soft, serif + mono stacks) and the base `body`/`.sheet` styles. Widen `.sheet` to ~760px max.

- [ ] **Step 2: Hero section** with this exact copy:
  - Topline (mono, uppercase): left `Markwise` / right `open source - MIT`
  - H1: `The review loop between you and your AI agent is broken.`
  - Sub: `Agents hand you long, clean markdown - PRDs, specs, launch plans. Then your feedback has to make it back to the agent, and that handoff is where everything falls apart.`
  - One-liner (highlighted like the lesson's `.oneliner .hi`): `Markwise is the human-agent review layer for markdown.`
  - CTA block: a copy-able command card containing exactly:
    `Install Markwise for me with "npm i -g github:farandclose/markwise", then run "markwise agent-setup" and follow what it prints.`
    with caption `Paste this into Claude Code, Codex, or any coding agent.` and a Copy button; plus a secondary link button `View on GitHub` -> `https://github.com/farandclose/markwise`.

- [ ] **Step 3: Copy-button JS** - `navigator.clipboard.writeText` with fallback to selecting the text node (`window.getSelection`) when the API is missing/rejects; button label flips to `copied` for ~1.5s.

- [ ] **Step 4: Visual check** - `python3 -m http.server 8123 -d site` and load in browser; hero matches lesson aesthetic.

- [ ] **Step 5: Commit** - `git add site/index.html && git commit -m "feat(site): landing scaffold + hero with agent-paste CTA"`

### Task 3: Problem + reframe sections

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: Problem section** - heading `The two things you can do today` with the lesson's two-column card pattern:
  - Col 1 `1. Reply in chat` / does: `You retype the feedback into the terminal: "in section 3, the timeline should be H2 not Q4..."` / why it fails: `It loses the exact location and the intent. You describe a spot in prose instead of pointing at it. The longer the doc, the worse it gets.`
  - Col 2 `2. Edit the markdown directly` / does: `You open the file and change the text yourself, or scribble inline notes.` / why it fails: `The agent gets no structured signal: what changed, what is still open, what needs a response. A raw diff is not a review.`
  - Below: `In Google Docs you comment and suggest edits right on the text, with threads and states. That fluency simply does not exist for the markdown an agent just wrote you.`

- [ ] **Step 2: Reframe insight card** (lesson's `.insight` pattern):
  - label `The core insight`
  - struck line: `The problem is that markdown needs comments.`
  - is-line: `Agent-written documents need a durable feedback loop that both humans and agents can understand.`
  - gloss: `Markwise is not annotation syntax. It is a workflow contract: the human leaves anchored, structured feedback; the agent revises and answers every item; the human decides what is resolved; and the document carries the whole history without polluting a normal read.`

- [ ] **Step 3: Commit** - `git commit -am "feat(site): problem and reframe sections"`

### Task 4: Interactive demo

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: Demo frame markup** - a stylized previewer window: mono titlebar reading `launch-plan.md` with three dots; document body (serif) containing:

  > `## Rollout` (rendered as a styled h-line, not a real h2)
  > `We will launch the partner beta in Q4 2026, with mobile following in the new year. Pricing stays flat through the beta period.`

  Sidebar/below-card area for the note thread. Controls under the frame: step dots (1-3), `Next` button, `Replay` button, and a caption line that narrates the current step.

- [ ] **Step 2: Demo state machine (vanilla JS, 4 states)**
  - State 0 (initial): plain doc. Caption: `An agent wrote this launch plan. The timeline is wrong.`
  - State 1 (you comment): `in Q4 2026` gets the highlight treatment; a comment card appears, author chip `you`: `We agreed H2, not Q4 - the partner beta cannot slip past summer.` Caption: `You select the text and leave an anchored comment.`
  - State 2 (agent revises): inline suggested replace - `in Q4 2026` struck in red, `in H2 2026` inserted in green; agent reply appears in the thread, author chip `agent`: `Changed to H2 2026. The mobile follow-up date assumed the Q4 start, so I flagged it below.` Caption: `The agent revises the doc and answers in the thread - as a suggested edit you can accept.`
  - State 3 (you resolve): thread collapses to a resolved chip (check + `resolved`), the replacement text becomes plain committed text. Caption: `You resolve it. The whole exchange is saved inside the markdown file - invisible in any normal preview.`
  - `Next` advances (disabled at state 3), `Replay` resets to 0, dots reflect state. Transitions use small opacity/translate animations (~.3s ease), honoring `prefers-reduced-motion`.

- [ ] **Step 3: No-JS fallback** - default the markup to state 3 (resolved scene) and have JS reset to state 0 on init; hide controls under `<noscript>`-toggled class or by rendering controls via JS.

- [ ] **Step 4: Verify in browser** - step through all states, replay, check animations and reduced-motion.

- [ ] **Step 5: Commit** - `git commit -am "feat(site): scripted review-loop demo"`

### Task 5: Contract, toolkit, why-not, get-started, footer

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: Contract section** - heading `The workflow contract`, numbered strip of five:
  1. `You leave anchored feedback - comments and suggested edits, right on the text.`
  2. `The agent revises the document against every note.`
  3. `The agent answers every item - what changed, what it pushed back on.`
  4. `You decide what is resolved. Closure is the human's call.`
  5. `The file carries the whole history - invisible in any normal markdown preview.`
  Then two requirement cards: `In-file truth` - `The document and all its review state are one self-contained artifact. No sidecar files, no database, no platform. Portable, version-controllable, model-agnostic.` / `Clean preview` - `All review data hides in HTML comments. GitHub, VS Code, and every normal markdown preview render the document clean.`

- [ ] **Step 2: Toolkit section** - heading `The toolkit`, mono command + one sentence each:
  - `markwise preview` - `Review in the browser: comment, reply, suggest edits, resolve. Three themes.`
  - `markwise prompt` - `Bundles the doc and every open note into an instruction block any model can act on.`
  - `markwise status` - `Whose turn is it? Open vs resolved, waiting on you vs waiting on the agent.`
  - `markwise lint` - `24 rules guard the review data; --fix repairs mechanical drift, never prose.`
  - `markwise export` - `A clean copy with every trace of review stripped. The original is never touched.`

- [ ] **Step 3: Why-not strip** - heading `Why not just...`, four compact cards:
  - `Google Docs / Notion` - `Your doc leaves the repo and the agent loses it. Truth moves out of the file.`
  - `PR review` - `Feedback anchors to diffs and lives in the forge, not the artifact. Prose is not code.`
  - `CriticMarkup` - `Editorial syntax, not a review loop - and raw markup leaks into every preview.`
  - `Chat` - `"In section 3, the timeline..." - describing locations instead of pointing at them.`

- [ ] **Step 4: Get-started section + footer** - repeat the copy-able agent-paste card from the hero (same JS), caption `Works with Claude Code, Codex, or any coding agent.`, GitHub link; footer: `Markwise - the human-agent review layer for markdown. MIT license.`

- [ ] **Step 5: Commit** - `git commit -am "feat(site): contract, toolkit, why-not, get-started sections"`

### Task 6: Responsive pass + browser verification

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: Responsive rules** - single column below 560px (columns, why-not grid, demo controls wrap), h1 scales down, demo frame stays readable at 375px.

- [ ] **Step 2: Full Playwright verification** against `http://localhost:8123`:
  - demo: step 0 -> 1 -> 2 -> 3, Next disables, Replay resets
  - copy button: click, assert `copied` label state
  - 375px viewport screenshot + desktop screenshot, visually inspect
  - console: zero errors; network: no external requests
- [ ] **Step 3: Fix anything found, re-verify**
- [ ] **Step 4: Commit** - `git commit -am "polish(site): responsive pass"`

## Self-review notes

- Spec coverage: hero (T2), problem+reframe (T3), demo (T4), contract/toolkit/why-not/get-started (T5), vercel zero-config (T1), verification + responsive + no-JS + copy fallback (T2/T4/T6). Out-of-scope items untouched.
- All copy is final text, no placeholders; demo states fully scripted.
