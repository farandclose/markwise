# Markwise landing page - design spec

Date: 2026-06-10
Status: approved (design walkthrough approved in session; repo will be public)

## Goal

A single-page marketing website for Markwise, hostable on Vercel with zero configuration,
that tells the broken-review-loop story and converts visitors via the agent-paste install.

## Decisions (made with the user)

1. **Scope:** one landing page. No docs pages, no lessons section.
2. **Tech:** one self-contained static HTML file (inline CSS/JS, no framework, no build step)
   at `site/index.html`, in this repo. A `vercel.json` at the repo root serves `site/` as-is
   and skips the TypeScript build.
3. **Primary CTA:** the agent-paste install block from the README ("Install Markwise for me
   with `npm i -g github:farandclose/markwise`, then run `markwise agent-setup` and follow
   what it prints."), with copy button. Secondary CTA: GitHub repo link
   (`https://github.com/farandclose/markwise`). The user will make the repo public.
4. **Demo:** a stylized, scripted interactive demo of the review loop on the page - not the
   real previewer, but an honest illustration of what it does.

## Design language

Lifted from `learning/lessons/0001-the-broken-review-loop.html`: warm paper background
(#faf7f0), dark ink, amber accent (#b27a16), serif body (Iowan Old Style/Charter stack),
uppercase mono section labels, hairline-bordered cards. Reads like a well-made document,
not a SaaS template. System fonts only; no external requests. No em-dashes in copy
(plain hyphens).

## Page flow

1. **Hero** - "The review loop between you and your AI agent is broken." Subline about
   agents producing long markdown and feedback falling apart on the way back. One-liner:
   "Markwise is the human-agent review layer for markdown." Two CTAs (agent-paste copy
   block, GitHub).
2. **The problem** - two-failure-modes columns (reply in chat loses location/intent;
   edit the file directly gives the agent no structured signal) + Google Docs contrast line.
3. **The reframe** - insight card: strikethrough "markdown needs comments" replaced by
   "agent-written documents need a durable feedback loop both humans and agents understand."
4. **Interactive demo** - scripted, stepped animation inside a stylized previewer frame:
   (a) human selects a sentence and leaves an anchored comment, (b) agent revises - inline
   suggested replace, struck red old text, green new text - and replies in the thread,
   (c) human resolves. Step/replay controls. Mirrors real previewer behavior (anchored
   notes, threads, suggested edits, states).
5. **The contract** - the five-step loop as a numbered strip (structured feedback -> agent
   revises -> agent answers every item -> human resolves -> file carries history invisibly),
   plus the two requirements: in-file truth and clean preview.
6. **The toolkit** - `markwise preview` (browser review UI, three themes) and the CLI
   (`prompt`, `status`, `lint`, `export`), one honest sentence each.
7. **Why not X** - one tight row: Google Docs / Notion / PR review / CriticMarkup, each
   with the one-line reason it breaks in-file truth or clean preview.
8. **Get started** - paste block again, "Works with Claude Code, Codex, or any coding
   agent", GitHub link, MIT note.

## Source material

- `PRODUCT_PITCH.md` - one-liner, core insight, positioning, why-not-CriticMarkup.
- `learning/lessons/0001-the-broken-review-loop.html` - problem framing, reframe, visual style.
- `learning/lessons/0002-the-roads-not-taken.html` - in-file truth + clean preview requirements.
- `README.md` - CLI surface, agent-setup CTA wording.

## Error handling / robustness

- Demo is progressive enhancement: with JS disabled the demo frame still shows the final
  resolved state as a static scene.
- Copy button falls back gracefully if the Clipboard API is unavailable (selects text).
- Responsive: single column below ~560px, matching the lesson's breakpoint.

## Verification

Open the page in a browser (Playwright): exercise the demo through all steps and replay,
click the copy button, check layout at desktop and 375px width, confirm no console errors
and no external network requests.

## Out of scope

Docs pages, lessons publishing, analytics, custom domain, waitlist/email capture,
embedding the real previewer.
