# Product

## Product Purpose

Markwise is a human-agent review layer for markdown. A reviewer leaves anchored, structured notes on
an agent-written file; a fresh agent revises the doc and answers every note. All review state lives
in the file itself, as HTML comments that stay invisible in normal markdown previews. The web
previewer is the reviewer's surface: a clean read of the document plus a notes rail. Success is a
reviewer commenting and handing off without ever leaving the document or thinking about the storage
format.

## Users

Reviewers of agent-written markdown: product managers and small product teams who already live in
markdown. Their context is a review pass on a draft an agent produced. The job to be done: read the
document, leave precise notes anchored to exact spans, and hand the file back to a fresh agent that
revises and responds. The reviewer wants commenting to feel as fluid as Google Docs while every bit
of review state stays inside the file.

## Brand Personality

Quiet, precise, unobtrusive. The previewer is document-first: the writing leads and the tool gets out
of the way. Three words: calm, precise, restrained. It should feel like a focused reading surface
that happens to support annotation, not an app wrapped around a document.

## Anti-references

- Generic AI SaaS (gradient-and-card filler that reads as machine-made).
- Corporate Google Docs (heavy toolbars, utilitarian enterprise tone).
- Notion-busy / over-featured (dense chrome, menus everywhere, competing affordances).
- Heavy / enterprise tools (admin-console density and weight).

## Design Principles

1. The document never moves. Spatial stability beats chrome. Reading is the primary surface, and
   opening, closing, or filling the notes rail must not shift the reading column.
2. Every annotation is tied to its text. A note is anchored, visible, and traceable to the exact span
   it covers; the comment and its source are always visually connected.
3. The tool disappears. Restraint over decoration. Familiar, standard affordances; nothing competes
   with the prose.
4. In-file truth. All review state lives in the markdown itself. The UI is a lens over the file, not
   a separate database.
5. Reviewer fluency rivals Google Docs; everything else stays quieter than Docs. Match the best-in-
   class commenting feel, but keep the surrounding interface calmer.

## Accessibility & Inclusion

Baseline target: WCAG 2.1 AA. Body text meets 4.5:1 contrast; reduced-motion is honored (the draft
composer's entrance is suppressed under `prefers-reduced-motion`). Keyboard and screen-reader support
for the full comment flow is a known area to harden. (Accessibility specifics were defaulted, not yet
confirmed by the team; revise this section when you have firm requirements.)
