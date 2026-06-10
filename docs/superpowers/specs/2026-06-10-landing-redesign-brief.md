# Landing page redesign - design brief (Ink & Proof on spruce)

Date: 2026-06-10
Status: confirmed by user (probe A "Ink & Proof" won; spruce background chosen from variants)
Supersedes the visual design of docs/superpowers/specs/2026-06-10-landing-page-design.md
(content assets - demo storyline, CTA mechanic, copy lines - carry forward).
Critique baseline: 27/40 (.impeccable/critique/2026-06-10T18-07-43Z__site-index-html.md).

## Identity

- Stage: deep spruce green-black (#0e1713 family); the document is the only light surface.
- Type: Literata (headlines + document voice), Hanken Grotesk (UI/body), Spline Sans Mono
  (commands/labels). Self-hosted woff2 subsets in site/fonts/ - zero third-party requests.
- Voices: human = gold #e8b04b, agent = green #8fc97e, paper = #f6f1e7 family.
- Color strategy: Committed dark. Scene: a PM at 11pm, IDE dark, the agent's draft is the
  one warm-lit page on the desk. Anchors: approved probe mockup, extend.ai layered-document
  hero concept, iA Writer night mode.
- Wordmark: lowercase "markwise" with gold "wise".
- Banned: numbered section kickers, repeated mono eyebrows, identical card grids, cream.

## Page architecture (five beats)

1. **Hero** - "Your agent writes the doc. You get the last word." + sub + paste-to-agent CTA
   + layered-document animation: three planes (document / gold human layer / green agent
   layer) drift apart, annotations land, stack collapses into one file with a resolved chip;
   slow loop. The hero IS the reframe; the old insight card is deleted.
2. **The problem, compressed** - retype-in-chat vs edit-the-file as one asymmetric passage.
3. **The loop, live** - existing demo restyled dark; autoplays on scroll-into-view, pausable,
   clickable dots, replay; captions aria-live; never renders an empty frame.
4. **The real thing** - actual screenshot of `markwise preview` (captured from the running
   previewer) + the five CLI commands; in-file truth + clean preview as the two promises;
   why-not-X reduced to one line each.
5. **Get started** - paste CTA + what-the-agent-will-do + GitHub + MIT; footer ends on the
   resolved-chip motif, not a hero copy.

## States and accessibility

- JS off: hero static exploded composition; demo shows final resolved frame; copy buttons hidden.
- prefers-reduced-motion: no loops, static layers, no smooth-scroll.
- Mobile: stack above headline, >=44px targets, slim sticky bar (wordmark + copy + GitHub).
- Clipboard fallback instructs "press Cmd+C".
- 4.5:1 contrast minimum (gold and sage body checked against spruce); focus states; landmarks.

## Out of scope

Docs pages, analytics, custom domain, embedding the real previewer.
