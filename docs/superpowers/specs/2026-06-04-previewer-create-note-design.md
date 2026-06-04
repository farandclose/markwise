# Markwise Previewer - Create-Note (thin slice) v0 Design

Status: Approved in brainstorm 2026-06-04. Next step: a de-risking spike, then an implementation plan (writing-plans). Surface: the reviewer-facing previewer (preview mode), Milestone 3a.

## Scope

This spec covers the **thin slice of create-note**: letting a reviewer originate a brand-new note in the previewer by double-clicking prose. It is the first slice of Milestone 3, deliberately cut to put the headline capability in the reviewer's hands quickly while attacking the one genuinely hard problem - mapping a click in the rendered page back to a position in the source markdown - on its easiest cases first.

It builds directly on M1 (read-only render + activation) and M2 (the lint-gated write pipeline `persist()`, and the reply/resolve verbs). Create is a third verb flowing through the same write path.

In scope:

- An **offset-breadcrumb** rendering foundation: the rendered HTML carries each text run's exact source position.
- Two creation gestures, using only the browser's built-in selection: **double-click a word** (a span comment on that word) and **double-click a space** (a point comment at that gap).
- The floating **Comment** pill and the **draft card** in the rail (Add / Cancel), plus the **Cmd+Option+M / Ctrl+Alt+M** shortcut to open a draft from a selection.
- A new server route `POST /api/note` and a new pure transform `createNote`, both flowing through the existing `persist()` lint-gated pipeline.

Out of scope (deferred, see the end):

- Drag-to-select an arbitrary phrase, and the macOS selection-ladder rungs beyond double-click (3-click sentence, 4-click paragraph). These are the next create-note slice.
- The other M3 pieces unrelated to create-note: discard a note (parent spec section 10), the resolved-notes browse view (section 14), and the "Done reviewing" handoff (section 11).
- Touch-device interactions.

## Principles carried in

From the parent previewer design (`2026-06-01-previewer-ui-design.md`):

- **Reviewer states intent; the agent revises prose** (D5 / D31). Every reviewer-created note is a plain `comment` anchored to the selection. The reviewer never picks `insert` / `delete` / `replace`; they write what they mean ("add a line about X here", "cut this", "reword to Y") and the agent interprets intent.
- **Placing a caret while reading must not nag** (parent section 7). A single click places a caret only - no pill, no note.
- **One write path, lint is the safety net** (M2). Create flows through the same `persist()` pipeline as reply and resolve; the file is byte-identical if anything is wrong.

## 1. The gesture model

The double-click is the single trigger for creating a note. Where the double-click lands decides the note's anchor kind:

| Gesture | Result | Anchor |
| --- | --- | --- |
| Single click on any text | Places a caret only (a "something goes here" position). No pill, no note. | none |
| Double-click a word | Selects the word, surfaces the Comment pill. | span (wraps the word) |
| Double-click a space | Selects the gap between two words, surfaces the same Comment pill. | point (marks the spot) |

Double-click-a-word is native browser behavior. Double-click-a-space is not - browsers do not natively select an inter-word gap - so the previewer detects a double-click that landed on whitespace and programmatically collapses the selection to that point. This is the first rung of the parent spec's selection ladder (section 7), implemented here for the two-click case only.

## 2. The breadcrumb foundation (the new machinery)

The hard problem: a position in the rendered page is not the same as a position in the source file, because markdown syntax (`#` headings, `**bold**`, `[link](url)`) and the note markers themselves are transformed or stripped on the way to the screen.

The solution is to make rendering emit **offset breadcrumbs**: every run of text in the rendered HTML is wrapped so it carries its exact character range in the **original source** (`data-src-start` / `data-src-end`). A double-click then reads its source position straight off the breadcrumb span(s) under the selection - a start offset for a point, start and end for a word - with no guessing and no fragile reverse-search.

Contract for the rest of the system:

- Breadcrumb offsets index the **original source string** (the bytes a note marker is written into), not any intermediate transformed string.
- Breadcrumbs coexist with the existing note-highlight spans in a **single render pass**. Today highlights are injected by splicing the source before markdown-it runs, which shifts offsets; this design unifies highlight injection and breadcrumb emission so the offsets that reach the browser are original-source offsets. The exact mechanism is the first thing the spike proves (section 6).

## 3. Creating a note (composition)

On a qualifying double-click (or Cmd+Option+M with a selection), a floating bar with a single **Comment** pill appears near the selection. Clicking Comment (or the shortcut) opens a **draft card in the rail**: a focused "Write a comment..." input with **Add** and **Cancel**.

- **Add:** the draft becomes a real note. The client sends the mapped source offset(s) and the comment body to the server; on success the document repaints (the existing M2 `load()` path), the selected text takes its resting highlight (or a point pillar appears), the open-notes counter ticks up, and the new note becomes the active card.
- **Cancel:** the draft and the selection clear; nothing is written.

The draft card reuses the rail's existing card styling and the one-active-card model from M1/M2.

## 4. Server: the create endpoint and transform

A new route `POST /api/note` accepts `{ kind: "point" | "span", start: number, end?: number, body: string }` and runs the same `persist(filePath, transform)` pipeline M2 introduced: read the file fresh -> apply a pure transform -> `fixText` -> `lintText` -> write only if there is no error-severity finding, otherwise respond 422 and leave the file byte-identical.

The new pure transform `createNote(source, { kind, start, end, body, at, id })` lives alongside `appendReply` and `resolveNote` in `src/preview/mutate.ts`. It:

1. Validates the body is non-empty and the offsets are in range (else `NoteMutationError`).
2. Mints a fresh unique note id (see section 5).
3. Inserts the marker(s) into the prose: a single `<!-- mw:ID -->` at `start` for a point, or a wrapping `<!-- mw:ID -->word<!-- /mw:ID -->` around `[start, end)` for a span.
4. Appends a complete record to the `mw:log` block, building the anchor's `before` / `after` context windows (and, for a span, the `hash`) by reusing the lint core's existing primitives (the same windowing `fix.ts` uses and the `hash.ts` short-hash), so the record is already correct before it reaches `fixText` / `lintText`. The pipeline's fix + lint then act as an idempotent safety net, exactly as they do for reply and resolve.

If the `mw:log` block does not yet exist (a fresh document with no notes), `createNote` creates it at the end of the file, mirroring how `resolveNote` creates `mw:archive` on demand.

## 5. The new record

The written record is a reviewer-authored comment:

- `type`: always `comment`. No `text` field (that field is only for `insert` / `replace`).
- `state`: `open`. `disp`: `none`.
- `anchor`: `{ kind: "point", before, after }` for a point, or `{ kind: "span", hash, before, after }` for a word.
- `thread`: seeded with one message `{ by: "reviewer", at, body }`, where `at` is the server-supplied ISO timestamp and `body` is the reviewer's comment.

**Id minting:** the new id must be unique across both `mw:log` and `mw:archive` (lint rule L140 forbids duplicates). `createNote` scans the existing ids in both blocks and mints the smallest unused id of the form `nN` (matching the ids already in use in the previewer's documents); note origin is carried by the thread's `by: "reviewer"` field, not by the id, so reviewer-created notes share the same id pool as agent-created ones. Uniqueness is additionally guaranteed by the lint gate: a colliding id is an error-severity finding, so the write is refused and the file is left untouched.

## 6. The spike (de-risk first; gates the plan)

Before writing the implementation plan, a small throwaway spike proves the breadcrumb foundation against the real enriched `sample.md` (which has bold, links, headings, and existing note markers). It must clear three bars:

1. **Original-source offsets in one render pass.** Breadcrumbs carry original-source offsets while note highlights still render, unified into a single pass.
2. **Double-click maps correctly.** A word and a gap each resolve to the correct source offset(s), verified by inserting a marker at the mapped position and confirming the document lints clean and the marker landed exactly where intended.
3. **Tricky spots round-trip:** a word inside `**bold**`, text immediately after a `[link](url)`, and a gap adjacent to an existing note marker.

If the spike shows original-offset breadcrumbs are materially harder than expected, the fallback for this slice is the coarser context-match or block-anchor approach considered in the brainstorm. The spike outcome gates the plan so we never build the feature on an unproven foundation.

## 7. Error handling and safety

Create inherits M2's guarantees unchanged:

- **One write path.** Every write goes through `persist()`; there is no other `writeFileSync`.
- **Lint gate.** The document is written only if the post-transform `fixText` + `lintText` produce no error-severity finding; otherwise the server responds 422 with a human-readable message and the file is byte-identical.
- **Read fresh.** `persist()` reads the current file contents at write time, so a create is applied to the latest state.
- **Input validation.** Empty body, missing offsets, or out-of-range offsets are rejected before any transform, with a `NoteMutationError` carrying the right HTTP status.

A practical edge: if the underlying file changed between render and click (so a client-sent offset is stale), the lint gate still protects document integrity - at worst the create is refused. This is an acceptable edge for a single-reviewer local tool; the previewer re-reads on every repaint.

## 8. Testing

Following the M1/M2 approach (TDD, vitest):

- **Pure transforms - full unit coverage:** `createNote` for point and word (correct marker placement, record shape, seeded reviewer thread message, correct `before` / `after` and span `hash`), and id minting (unique, no collision with existing log or archive ids, log-block creation when absent).
- **Breadcrumb rendering - unit tests:** given formatted source, each run's `data-src-start` / `data-src-end` indexes the correct source substring.
- **Create endpoint - integration tests:** happy path for point and word; the 422 lint gate leaves the file byte-identical; bad input (empty body, out-of-range offset) is rejected.
- **Acknowledged gap:** the browser-side gesture detection (double-click word vs gap, the pill, the draft card) is vanilla JS and the hardest to auto-test. It follows the M2 precedent of programmatic HTTP end-to-end coverage for the endpoint plus manual dogfooding on `playground.md`. The double-click-a-space gap selection is custom and leans most on manual verification.

## 9. Deferred (post-slice)

- Drag-to-select an arbitrary phrase (multi-run spans), and the macOS selection-ladder rungs beyond double-click: 3-click sentence and 4-click paragraph (parent spec section 7).
- Discard a note (parent spec section 10), the resolved-notes browse view (section 14), and the "Done reviewing" clipboard handoff (section 11) - the other Milestone 3 pieces.
- Touch-device interactions.
- Per-note-type color language (parent spec section 4 treatments remain placeholders).
