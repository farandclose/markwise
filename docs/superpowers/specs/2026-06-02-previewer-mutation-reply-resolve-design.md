# Markwise Previewer - Mutation v0: Reply + Resolve (M2 Design)

Status: Approved in brainstorm 2026-06-02. Next step: implementation plan (writing-plans).

Parent spec: `docs/superpowers/specs/2026-06-01-previewer-ui-design.md` (the full preview-mode design). This document is a focused milestone slice of that spec plus the design decisions made while scoping it. It does not change the parent design; it implements part of it and records the choices the parent left open.

## Relationship to the milestones

The previewer ships in milestones:

- **M1 - read-only foundation: SHIPPED** (`main`, 2026-06-02). `markwise preview <file>` renders the document, reveals notes, and lets a reviewer browse threads. Mutation controls render disabled. Covers parent spec sections 1-5 and 13.
- **M2 - mutation, reply + resolve: THIS SPEC.** Wire the two verbs that act on notes the agent already wrote: Reply and Resolve. Covers parent spec sections 6 and 9, plus two M1 follow-ups.
- **M3 - mutation, create-note: FUTURE.** Originating a brand-new note: the macOS selection ladder (parent spec section 7), the floating Comment bar and draft card (section 8), and the hard rendered-selection to source-offset mapping. Deliberately deferred to its own milestone and its own brainstorm.

The split is by difficulty. Reply and Resolve operate on an existing note by its `id` and need no text-selection machinery. Create-note needs the selection ladder and the rendered-to-source mapping, which is the one genuinely hard problem in the previewer. Isolating it keeps M2 small and shippable.

## Decisions captured in this brainstorm

1. **Scope split.** M2 = Reply + Resolve + M1 follow-ups. Create-note is M3. (Resolves the parent spec's implicit "all of sections 6-11 at once.")
2. **Resolve is one-click with an auto-derived summary.** The parent spec frames Resolve as a "terminal accept-and-close" but its archive record requires a one-line `summary`. M2 fills that line automatically from the note's opening thread message (no typing, no extra prompt), so Resolve stays a single click and the archive still reads as meaningful audit history.
3. **Simple write-safety model.** The previewer is localhost-only and single-user. Each mutation re-reads the file fresh, applies a pure string transform, re-stabilizes anchors, validates with the existing linter, and only writes if the result is clean. No file locking, no optimistic DOM patching. Last-write-wins; a mutation can never persist a file that would not lint.

## 1. Write architecture

All mutation flows through one canonical server-side pipeline so the file can never be corrupted:

```
read file fresh  ->  apply mutation (string -> string)  ->  fixText (re-stabilize anchors)
   ->  lintText (validate)  ->  error-level findings?  ->  yes: refuse, return error, file untouched
                                                          ->  no:  writeFileSync, return fresh payload
```

- **Read fresh** every request (same as M1's `GET /api/doc`), so the previewer always works against the file's true current state, including any hand edits or agent edits since the page loaded.
- **Pure string transforms** live in a dedicated module (`src/preview/mutate.ts`) and reuse the existing building blocks (`parse`, `shortHash`, targeted marker strip). They take `source` in and return new `source` out, so they are unit-testable without HTTP or the filesystem.
- **`fixText` re-stabilizes anchors** after the transform. `fixText` only recomputes the mechanical anchor fields (`hash`, `before`, `after`) and is byte-stable everywhere else, so it leaves our reply and archive changes intact while keeping the remaining notes' anchors correct after a resolve removes markers from the prose. Running it after every mutation (including reply, where it is a no-op) keeps the pipeline uniform.
- **`lintText` is the safety net.** If the post-mutation, post-fix result has any error-severity findings, the server refuses to write and returns an error; the file on disk is never touched. If the file already had errors before the mutation (it should not, coming from a compliant agent), the error response tells the reviewer to run `markwise lint` first. (A later refinement could block only on errors the mutation newly introduces; v0 keeps the simpler whole-file check.)
- **No locking.** Single user, single file, single machine. Last-write-wins is acceptable; the lint gate prevents corruption, which is the only outcome that actually matters here.

## 2. Server endpoints

Two new routes on the existing preview server (`src/preview/server.ts`). Everything else (the `GET /api/doc` read endpoint, static asset serving, localhost binding) is unchanged.

- **`POST /api/note/:id/reply`**, body `{ "body": "<message text>" }`
  - Appends `{ by: "reviewer", at: "<ISO now>", body: "<message text>" }` to the note's `thread`.
  - Validates: `id` exists in `mw:log`; `body` is a non-empty string. Otherwise a clean 4xx with a message, file untouched.
  - On success: runs the write pipeline, returns the fresh `DocPayload`.
- **`POST /api/note/:id/resolve`**, no body
  - Strips the note's marker(s) from the prose, moves its record from `mw:log` to `mw:archive`, returns the fresh `DocPayload`.
  - Validates: `id` exists and is currently open in `mw:log`. Otherwise a clean 4xx, file untouched.

Both endpoints return the same `DocPayload` shape that `GET /api/doc` returns, so the browser refreshes through one code path.

The server stays a thin HTTP shell: parse the route and body, call into `mutate.ts`, run the pipeline, write, respond. No business logic in the server itself.

## 3. Reply behavior

- A reply is authored by the reviewer: `by: "reviewer"`, `at` = the server's current time in ISO 8601, `body` = the submitted text verbatim.
- Replies append to the existing `thread` array in order. They never edit or remove prior messages (notes are immutable; iteration is by reply, per parent spec section 6).
- Empty or whitespace-only bodies are rejected before any write.
- The prose is not touched by a reply, so anchors are unaffected (the `fixText` step is a no-op here but runs anyway for pipeline uniformity).

## 4. Resolve behavior

When the reviewer resolves note `id`:

1. **Strip the note's markers from the prose** with a targeted single-note strip (not the existing `stripText`, which removes every note and block). For a **span** note, remove both `<!-- mw:id -->` and `<!-- /mw:id -->`, leaving the once-wrapped text as plain prose. For a **point** note, remove the single `<!-- mw:id -->` marker. Only this note's markers are removed; every other note is left exactly as is.
2. **Move the record from `mw:log` to `mw:archive`.** The `mw:log` record is removed. A compact archive record is appended to the `mw:archive` block (creating that block if it does not yet exist): `{ id, type, state: "resolved", at: "<ISO now>", summary: "<auto>" }`.
3. **Auto-derive the summary.** `summary` = the note's opening thread message body (`thread[0].body`), collapsed to a single line (newlines and runs of whitespace become single spaces) and truncated to a reasonable one-line length (target 80 characters, with a trailing ellipsis when truncated). If a note somehow has an empty thread, fall back to a generic `"Resolved"`. This keeps the archive's audit value ("what feedback this doc needed") with zero reviewer friction.
4. The counter (count of open notes) naturally ticks down on the next payload, because the record is no longer an open `mw:log` entry.

The resolved record stays in the file forever as audit history. Browsing resolved notes in the UI remains deferred (parent spec section 14); the data is preserved regardless.

## 5. Browser wiring

The M1 app already renders the Reply box, Reply button, and Resolve button in a disabled state. M2 makes them live and routes them through a single refetch path.

- **Reply:** typing enables the Reply button; sending POSTs to `/api/note/:id/reply`, clears the textarea, and repaints from the returned payload. The new message appears in the thread under the reviewer's name with its timestamp. The card stays active.
- **Resolve:** one click POSTs to `/api/note/:id/resolve`. On success the highlight disappears from the prose, the card leaves the rail, and the counter ticks down, all from the returned payload.
- **Refetch, not optimistic patching.** Every successful mutation repaints from the server's returned `DocPayload` (the same structure `GET /api/doc` returns), so the counter, rail order, thread contents, and prose highlights stay exactly in sync with the file on disk. No optimistic DOM mutation to drift out of sync.
- **Errors are surfaced quietly.** A failed mutation (bad id, empty reply, lint refusal) shows a brief, non-blocking message and leaves the UI as it was; nothing was written, so a refresh is consistent.

## 6. M1 follow-ups folded into M2

- **Open-only highlights (defensive).** The renderer paints a reveal highlight only for notes that are still open. Once Resolve strips a note's markers this cannot matter, but the guard ensures a stray marker can never leave a dead, cardless highlight.
- **Per-speaker thread styling.** Thread messages get a light visual distinction between `reviewer` and `agent` authorship (e.g. `mw-by-reviewer` / `mw-by-agent` classes). Now that the reviewer is actively replying, telling one's own messages apart from the agent's at a glance is worth a small, layout-neutral treatment.

## 7. Testing

Same rhythm as M1 (test-driven, subagent-driven):

- **Unit tests on `src/preview/mutate.ts`** (pure string in/out): reply appends a correctly shaped reviewer message; resolve strips span markers (both ends) and point markers (single), moves the record to `mw:archive`, derives and truncates the summary, creates the archive block when absent, and leaves all other notes byte-stable. A malformed/unknown id is rejected without producing output.
- **Endpoint tests on the two new routes**: happy path returns the fresh payload and the on-disk file reflects the change; bad id, empty/missing body, and a mutation that would not lint each return a clean error and leave the file untouched.
- **End-to-end browser pass**: drive a real Reply and a real Resolve in the browser, confirming the thread, counter, rail, and prose all update and the file on disk matches.

## 8. Out of scope for M2 (to M3 or later)

- Create-note: the selection ladder (parent spec section 7), the floating Comment bar and draft card (section 8), and the rendered-selection to source-offset mapping. This is M3.
- Discard a note (parent spec section 10), the archive browse view (section 14), touch interactions, the finalized per-type color language, who-spoke-last indicators, and navigation/keyboard beyond what M1 and M2 already do. All remain deferred per the parent spec.
