# Markwise - Design Decisions
A running record of what we've decided and _why_. Append new decisions; don't rewrite old ones (cross them out or supersede with a dated note if they change).

Last updated: 2026-05-24

* * *
## Reviewer focus

Please review the whole document - nothing here is off-limits, and broad feedback is welcome. That said, these three decisions are where we most want genuine, solid feedback and concrete alternative suggestions, because we are least certain about them:

1. **D4 - storing feedback as HTML comments instead of CriticMarkup or a sidecar file.** Is text-embedded `mw:` markup the right call, or is a sidecar file / AST-based anchor more robust? What breaks at scale?
2. **D8 + open question 5 - anchor drift.** This is genuinely unsolved: what happens to a fence pair when the surrounding prose is edited or a tool reformats the file (a fence dropped, or fences separated from their text)? We want real proposals here.
3. **Structured data inside HTML comments** (the `mw:log` footer). Is encoding structured records inside HTML comments sound, or is there a better embedded format?

Push hard on these, but do not limit the review to them.

* * *
## Problem statement
Agents are now competent producers of long-form markdown - specs, research notes, PRDs, summaries - but the feedback loop _back_ to the agent is broken. Reviewers either type prose back into a chat (losing the _locality_ of which line/claim the feedback is about, and the _intent_ - is this a nit, a rewrite, a question, a "go research this more"?) or accept the doc as-is.

There is no shared protocol for anchored, structured feedback that an agent can reliably consume, revise against, and respond to.

**Markwise defines that loop:** a way for any human to leave anchored, structured feedback on any agent-written markdown doc, and for the agent to close the loop by revising the doc and explicitly responding to every piece of feedback. Think manager <-> knowledge-worker review, not a one-shot handoff.

* * *
## What markwise is (and is not)
Markwise is **three things together**:

1. **A protocol** - a convention for how feedback, replies, states, and suggested edits are encoded in a markdown file.
  
2. **A CLI** - small tooling to validate, summarize, resolve, and export docs.
  
3. **A previewer / interaction UI** - a clean-preview local review surface, inspired by but distinct from tools like Roughdraft, that renders the doc cleanly, hides resolved feedback, highlights what needs attention, and lets a human add/edit feedback without hand-authoring raw syntax.
  

Markwise is **not**: a real-time collaborative editor, a Google Docs replacement, a general PR-review tool, or an agent itself. It is the **feedback layer** between any human and any doc-producing agent.

* * *
## Design principles

These principles outrank individual decisions. When a decision (or a proposed refinement) conflicts with a principle, the principle wins unless we consciously amend the principle itself. Added 2026-05-24.

### P1 - Self-containment: zero-tool comprehension
A markwise document must be fully understandable and answerable from its raw source alone. No decoder, tool, or sidecar should be required to read what feedback exists, where it applies, or what response is expected.

- Tooling (CLI, previewer) adds convenience, enforcement, and lifecycle management - never comprehension.
- Prefer plain-text encodings over opaque ones. (This is *why* we chose escaping over base64 for payloads - see D13/D17.)
- **Success metric - surface area:** maximize the set of AI agents (Claude, Codex, and any future model) that can consume a markwise doc with *zero special integration*. If a tool can read markdown, it can participate.

### P2 - Metadata budget: stay lightweight
Review metadata should stay lightweight relative to the document it annotates, measured in **tokens** (characters as a cheap proxy).

- **Design target, not a hard limit:** for a typically-reviewed document, total markwise overhead should stay under ~30% of the base document's tokens, with resolved items stored compactly. The 30% is a gut-set guardrail we will calibrate against real docs.
- Overhead scales with the *number of feedback items*, not document length, so apply the budget as a *per-item* target (one comment's metadata should be small relative to the text it annotates) plus this aggregate soft target.
- Active review may be temporarily heavier (many open threads); resolved storage must compress.
- If a feature pushes us well past the budget, that is a signal to make the encoding leaner - not to silently accept bloat.

**These principles actively constrain the review refinements:** they are what rejects base64 (D13), force selector recovery (D12) to be *compact* - a hash plus short context, not a full duplicate of the annotated span - and keep durable IDs (D15) lean inline (short alias inline, durable ID only where needed).

* * *
## Decisions
### D1 - Audience: any human reviewing any agent-written doc
Not locked to a single persona (PM, dev, researcher). The reviewer is a human; the author is an agent. The _loop_ is the product, not a specific job role.

**Implication:** the doc must stay readable for a human, since the human is the customer.

* * *
### D2 - Feedback is anchored to the doc, threaded, and lives in the file
Feedback is tied to a specific location in the doc (not free-floating chat), can have a back-and-forth thread (comment -> reply -> reply), and is stored _in the markdown file itself_ (not a sidecar file).

**Why:** the agent gets the doc and all its feedback as a single artifact in one read - no hunting across multiple files. Keeps the canonical artifact self-contained.

**Layout:** _anchor inline, thread in a footer block._ A small marker sits at the point being commented on; the full thread (comment + replies) is collected in a log block at the bottom of the doc.

**Why this layout (not full-inline threads):** we optimize for the _human_ reviewer, who needs to re-read the doc cleanly. Agents are good at stitching context from a footer; humans are bad at reading prose with multi-line comment threads jammed mid-sentence. Footer layout also keeps the _raw_ markdown source readable, not just the rendered preview.

* * *
### D3 - Comment states: open / addressed / declined / needs-clarification
**2026-05-24 refinement:** D11 supersedes this single-state model with separate `agent_disposition` and `review_state` fields.

Four states to start.

- `open`, `addressed`, `declined` - human-owned transitions.
  
- `needs-clarification` - agent-owned (the agent uses this to ask a question back before revising).
  

**Why explicit ownership:** prevents ambiguity about who is blocked on whom.

**Resolved feedback is preserved, not deleted.** When feedback is addressed/declined it stays in the file (hidden in the markwise preview) rather than being removed. The history of _what kind of feedback this doc/agent needed_ is itself valuable signal - for the human (recurring failure modes) and for the agent (which of its instincts were wrong). (This decision is enabled by D4 - because storage is invisible in all previewers, keeping resolved feedback costs nothing in cleanliness.)

* * *
### D4 - Storage format: HTML comments for everything (chosen over CriticMarkup)
**2026-05-24 refinement:** D10 keeps HTML comments as the transport but narrows the renderer guarantee and adds explicit hidden-data/export safety requirements.

All markwise feedback - comments, replies, and suggested edits - is encoded as HTML comments (`<!-- mw:... -->`) embedded in the markdown.

**Why HTML comments:**

- ~~HTML comments are **invisible in every markdown renderer ever made** - GitHub, VS Code preview, Obsidian, Notion, GitLab, Slack previews, all of them. The doc reads completely clean everywhere, during _and_ after review.~~ Superseded by D10: HTML comments are hidden in most mainstream markdown renderers and are a practical default for Markdown-preserving workflows.
  
- This is a strictly stronger guarantee than "delete feedback once resolved," which only cleans up _after_ review and still pollutes mainstream previewers _during_ review (exactly when a doc is most likely to be shared).
  
- One format for everything - simpler protocol.
  
- Markwise's own previewer parses the `mw:` comments and renders them richly (highlighted open comments, hidden resolved ones, colored suggested edits).
  

**Why NOT CriticMarkup** (`{>>comment<<}`, `{++insert++}`, `{--delete--}`):

- Most mainstream previewers (GitHub, VS Code, Obsidian-default, Notion, GitLab) do **not** support CriticMarkup - the syntax renders as literal ugly text. Only a few writing apps (iA Writer, Typora, Marked) render it nicely.
  
- So CriticMarkup would pollute the read in exactly the places people most commonly view markdown.
  

**Cost we accept:** markwise becomes its own micro-convention rather than riding on the existing CriticMarkup standard. And suggested edits will only render in _color_ inside markwise - not in third-party writing apps like iA Writer. We judged this acceptable because markwise _is_ the previewer that renders suggestions beautifully, so we don't need CriticMarkup to do that job. (The deciding question was: "do we expect reviewers to view docs in iA Writer/Typora often enough that seeing proposed edits _there_ matters?" - answer: no, not enough to justify the pollution.)

* * *
### D5 - Agent's job after feedback: revise _and_ reply to every comment
**2026-05-24 refinement:** D11 keeps this requirement but changes the ownership model. The agent records its disposition; the human owns final review closure.

The agent doesn't just silently produce a v2. For every piece of open feedback it either applies a change _or_ explains why it didn't. ~~The agent transitions the comment to `addressed`, `declined`, or `needs-clarification`.~~ Superseded by D11: the agent records its disposition, and the human owns final review closure. Closes the loop explicitly, like a writer working through tracked edits.

* * *
### D6 - Model-agnostic
Markwise is not tied to Claude or any specific model. The protocol is plain markdown + HTML comments - any model can read and write it. Portability _is_ the point.

* * *
### D7 - CLI surface (scope kept deliberately tight)
**2026-05-24 refinement:** D11 changes the status model, and D16 expands the candidate CLI surface to include review handoff and CriticMarkup interop.

A small CLI, not a markdown editor. Candidate commands (to be refined when we walk through operations):

- `markwise lint <doc>` - validate every comment has an ID, flag orphan replies, find open comments with no agent response.
  
- `markwise status <doc>` - count open / addressed / declined / needs-clarification. Human-facing summary.
  
- `markwise prompt <doc>` - emit the model-agnostic instruction block to hand to any agent, listing what's open and how to respond.
  
- `markwise export <doc>` - emit a clean copy (strip markwise comments) for sharing to non-markwise contexts. (Less critical now that HTML comments are already invisible everywhere, but still useful for fully stripping the file.)
  

**Why tight scope:** the risk is drifting into "build a markdown editor." The protocol is the product; the CLI just makes it enforceable.

* * *
### D8 - Span anchoring: paired fence markers, matched by ID
**2026-05-24 refinement:** D12-D15 keep paired fences but add selector recovery, suggested-edit conflict rules, and durable internal IDs.

Feedback that targets a *span* of text (not just a point) wraps that span with a pair of HTML-comment markers, the same way an HTML tag wraps content with an open and close tag:

```
The product ships by <!-- mw:c1 -->Q3 of next year<!-- /mw:c1 -->, which gives us runway.
```

The inline markers carry only the ID and which end they are. All details (type, state, author, timestamp, body/payload) live in the footer log entry keyed by that ID.

**Decided sub-rules:**

- **Pair by ID, never by position.** The parser matches `mw:c1` to `/mw:c1` by ID, not by nesting depth. This is what lets markwise support *overlapping* spans, which real HTML tags cannot. (e.g. `<!-- mw:c1 -->A <!-- mw:c2 -->B<!-- /mw:c1 --> C<!-- /mw:c2 -->` is valid.)
- **No markwise markers inside fenced code blocks.** HTML comments are not interpreted inside a ``` code block - they would render as visible literal text, the one place the scheme leaks. So markwise does not operate inside code blocks; to comment on code, anchor outside the block. `lint` should reject any `mw:` marker found inside a code fence.
- **Marker shape follows the operation type:**

  | Operation | Marker shape | Why |
  |---|---|---|
  | Comment on a point | single marker `<!-- mw:c1 -->` | no range, just a location |
  | Comment on a span | fence pair | has a range |
  | Suggested insert | single marker | inserting *at* a point; no existing text to wrap |
  | Suggested delete | fence pair | wrap the text to be removed |
  | Suggested replace | fence pair | wrap the old text; new text lives in the footer |

  A point comment is the degenerate single-marker case of the same model, so operations 1 and 2 are unified under one mechanism.

**Why this approach:** it answers the span-length problem ("how long is the selection?") explicitly via open/close fences, stays invisible in every previewer, keeps the raw source readable (markers are tiny; payload is in the footer), and lets the agent read the span text in place between its fences.

* * *
## Decision refinements from review - 2026-05-24

These decisions refine D1-D8 after comparing Markwise with CriticMarkup and Roughdraft. See `PRIOR_ART_COMPARISON.md` for the fuller side-by-side analysis.

### D9 - Clean mainstream markdown preview is a core requirement
Markwise should explicitly treat clean rendering in mainstream markdown previewers as a core product requirement, not just a nice implementation detail.

**Requirement:** a markdown file under active review must remain visually clean in mainstream markdown previewers that do not know Markwise exists.

**Why this matters:** this is the main reason Markwise can justify a custom protocol instead of adopting CriticMarkup or Roughdraft-flavored CriticMarkup as-is. If this requirement is relaxed, the HTML-comment protocol becomes much harder to defend; adopting or extending Roughdraft-flavored CriticMarkup would likely be simpler.

**Implication:** Markwise should not position itself as "CriticMarkup, but hidden" or "Roughdraft, but with different syntax." The better framing is:

> Markwise is a clean-preview, protocol-first review layer for agent-written markdown, with interoperability paths to CriticMarkup and Roughdraft-style workflows.

### D10 - HTML comments remain the transport, but the guarantee must be narrower
D4 remains directionally right: HTML comments are still the preferred embedded transport for Markwise metadata because they keep ordinary markdown previews clean.

But D4 overclaims the guarantee. Replace "invisible in every markdown renderer ever made" with a narrower claim:

> HTML comments are hidden in most mainstream markdown renderers and are a practical default for Markdown-preserving workflows.

**Why the narrower claim:** some systems strip comments, sanitize HTML, normalize markdown, import/export through lossy editors, or otherwise rewrite the source. Markwise must assume comments can be corrupted or removed outside Markdown-preserving workflows.

**New requirement:** `markwise lint` must detect missing, malformed, dangling, or corrupted Markwise records wherever possible.

**Hidden-data risk:** because Markwise data is invisible in previews, users can accidentally share sensitive review comments in the source file. Therefore `markwise export` / `markwise strip` should be treated as a first-class sharing workflow, not a secondary convenience.

### D11 - Separate agent disposition from human review state
**2026-05-31 refinement:** D34 removes `reopened` (`review_state` is `open` / `resolved` only; resolve is terminal) and D35 adds `answered` to `agent_disposition`. The value lists in the table below are updated to match; the two-axis split otherwise stands.

D3 and D5 currently blur ownership. D3 says `addressed` and `declined` are human-owned transitions, while D5 says the agent transitions comments to `addressed`, `declined`, or `needs-clarification`.

Replace the single state model with two related concepts:

- `agent_disposition`: what the agent says it did with the feedback.
- `review_state`: whether the human considers the feedback loop closed.

Initial values:

| Field | Values | Owner |
|---|---|---|
| `agent_disposition` | `none`, `applied`, `answered`, `declined`, `needs_clarification` | agent |
| `review_state` | `open`, `resolved` | human |

**Why:** the agent should be able to say "I applied this" or "I declined this because..." but the human should decide whether that actually resolves the feedback. This avoids false closure.

**Status summaries:** `markwise status` should report both dimensions, for example "5 open, 3 awaiting human resolution, 1 needs clarification."

### D12 - Span fences are anchor hints, not the only source of truth
D8's paired fence markers are still useful, but they should not be the only anchor mechanism. A valid fence pair can still drift to the wrong text after editing, formatter rewrites, or agent changes.

Every anchored item should store a recovery selector in the footer record, in addition to the inline marker or fence.

Recommended selector fields:

- exact selected text
- normalized selected-text hash
- short prefix context
- short suffix context
- heading path
- optional block or paragraph index as a weak hint

**Validation rule:** if the inline fence exists but the selected text no longer matches the stored selector/hash, Markwise should not silently trust it. It should mark the item as `stale` or `needs_reanchor`.

**Why:** inline markers make the common case simple; selector metadata makes drift detectable and often recoverable.

### D13 - Structured payloads need a safe versioned envelope
Do not put arbitrary JSON, YAML, markdown, or user-authored text directly inside `<!-- ... -->` without an escaping strategy. User text, suggested edits, and quoted content can contain sequences such as `--` or `-->`, which can break HTML comments.

Use a versioned envelope and encode unsafe payloads.

Possible shape:

```md
<!-- mw:item v=1 id=mw_01HX... type=comment payload_b64u=... -->
```

Or a footer record where the structured payload is encoded as base64url JSON.

**Requirement:** the schema should be designed from the operations walkthrough, not in isolation. But whatever schema is chosen must be:

- versioned
- machine-parseable
- safe against HTML comment terminators
- able to represent threads, replies, suggested edits, selectors, timestamps, authors, dispositions, and review states

**Implication:** human readability of raw payloads is less important than safe round-tripping. The human-facing readable surface is the previewer and CLI.

### D14 - Allow overlapping comments, but restrict overlapping suggested edits in v1
D8 allows overlapping spans by pairing fences by ID. That is useful for comments, because real review feedback can overlap.

But overlapping suggested edits create difficult accept/reject semantics. If two replace/delete suggestions partially overlap, accepting one can invalidate the other.

V1 rule:

- overlapping comments are allowed
- overlapping suggested edits are rejected by `lint` or marked as conflicts
- suggested edits that cross block boundaries are out of scope unless a concrete operation requires them

**Code fences:** D8's "no Markwise markers inside fenced code blocks" remains right for v1. However, comments on code examples should eventually be supported by anchoring to the code-fence block and storing an internal line range in the footer record, rather than inserting HTML comments inside the code fence.

### D15 - Use durable IDs internally; display short aliases only in UI
Sequential IDs such as `c1` are readable but fragile across multiple reviewers, branches, merges, and generated edits.

Use collision-resistant durable IDs internally, such as a ULID-style `mw_...` ID. The UI may still display local aliases like `c1`, `c2`, or `s1` for readability.

**Rule:** durable IDs are part of the protocol; short aliases are presentation.

### D16 - Borrow prior-art workflows, but keep Markwise's storage goal distinct
CriticMarkup and Roughdraft should be treated as prior art and interoperability targets, not dismissed.

Borrow from CriticMarkup:

- comment
- highlight
- insert
- delete
- replace/substitute

Borrow from Roughdraft:

- local `open <file>` review surface
- a "Done Reviewing" handoff event
- JSON output an agent can wait on
- a review index agents can query
- eventual MCP tools

Do not borrow Roughdraft's storage model as the default unless Markwise gives up D9's clean-preview requirement.

Candidate future commands:

- `markwise open <doc> --json`
- `markwise watch <doc> --json`
- `markwise import --criticmarkup <doc>`
- `markwise export --criticmarkup <doc>`

* * *
### D17 - Resolutions after reviewing Codex's feedback (2026-05-24)
Our decisions on the D9-D16 review refinements, governed by the new principles P1 and P2.

- **D13 payload encoding - chose Option B (minimal escaping).** Escape only the sequences that break HTML comments (`-->`, and `--` where the parser is strict); keep the payload otherwise human- and agent-readable. Rejected Option A (base64) because it violates P1 - it would make the raw file unreadable without the markwise decoder. We may revisit if escaping proves fragile in practice, but that would be a conscious P1 amendment, not a default.
- **Accepted broadly:** D9 (clean preview as a core requirement), D10 (narrower renderer guarantee + export/strip as first-class), D11 (split `agent_disposition` from `review_state` - this also fixes the real D3/D5 contradiction), D12 (selector recovery for anchor drift), D14 (overlapping comments allowed, overlapping suggested edits restricted in v1).
- **D12 must stay compact (per P2):** store a hash plus short prefix/suffix context, *not* a full copy of the annotated span, so selector recovery does not blow the metadata budget.
- **D15 - adopt the principle, defer the machinery.** "IDs are protocol, short aliases are presentation" is accepted. Full ULID-style durable IDs are not a v1 requirement for a single-reviewer local flow; keep inline footprint minimal per P2 and add durable IDs when multi-reviewer / branching scenarios are real.
- **`PRODUCT_PITCH.md` is parked.** The market-positioning, category, and target-user material is ahead of where we are. Treat it as a parking-lot doc; do not let positioning debates block proving the protocol. `PRIOR_ART_COMPARISON.md` is kept as useful rationale.

* * *
### D18 - The thread is authoritative for intent; structured payloads are re-synced, never left contradicting it (2026-05-24)
Once an item is reopened and re-discussed, its original structured payload can disagree with the latest conversation. Example: a `replace` item carries `"with":"Q4"`, the agent applies it, then the human reopens with "actually marketing wants H2 framing, not a specific quarter." Now `"with":"Q4"` is stale and contradicts the latest intent.

**Rules:**

1. **The thread is chronologically authoritative for *intent*.** Later messages supersede earlier ones. The agent always acts on the net latest instruction in the thread, never on a frozen original payload.
2. **Structured payloads are re-synced on every agent action.** When the agent acts, it updates the record's structured fields (e.g. `with`, `text`, even `type`) to match what it actually did and what the thread now asks. The record must never be left holding a structured value that contradicts the thread or the prose.

**Why:** a future reader - human or agent - glancing at `"with":"Q4"` after the intent has moved to "H2 framing" would be misled. Keeping structured fields trustworthy is what lets agents act on the record quickly without re-deriving everything from the thread each time. The structured payload is a clean shortcut for the *first* pass; once an item is reopened and evolves, it becomes a conversation-driven revision and the thread governs.

**Related clarifications established by the worked example:**

- **Identity vs. locator vs. fingerprint.** An item's identity is its **id** (stable, never changes). Its primary **locator** is the inline fence, which physically wraps the current text. The **selector hash** (D12) is a *recovery aid* used only when the fence is missing or broken. So the hash changing as the wrapped text changes (e.g. `Q3` -> `Q4`) is expected and harmless: the agent locates via the fence and reads the thread via the id; the hash should always fingerprint the *current* content.
- **Reopen does not revert the prose.** `review_state=reopened` is a signal for the agent to act again; it does not roll back an already-`applied` change. The prose stays as last applied until the agent's next action. (Chosen over storing rollback buffers, which would cost payload against P2.) See D19 for what happens to `agent_disposition` on reopen.

* * *
### D19 - Resolve mechanics, and reopen resets `agent_disposition` to `none` (2026-05-25)
**2026-05-31 refinement:** D34 removes reopen entirely. The "reopen resets disposition" rule and the `reopened` rows in the matrix below are **superseded** - resolve is terminal. The **Resolve mechanics** section (fence strip + move to `mw:archive` + compact summary) stands unchanged.

**Reopen resets `agent_disposition` to `none`.** A reopen is a fresh ask the agent has not acted on yet, so its disposition relative to the current ask is `none`. Without this reset, `reopened+applied` would mean two different things ("agent hasn't responded to the reopen" vs. "agent has"). The reset removes the ambiguity. The previous disposition is not lost - it lives in the thread. The "this was bounced back" signal is carried by `review_state=reopened`, so the state matrix stays unambiguous:

| `review_state` | `agent_disposition` | Meaning |
|---|---|---|
| `open` | `none` | Brand new; agent hasn't acted |
| `open` | `applied` | Agent applied; awaiting human's first review |
| `reopened` | `none` | Bounced back; agent hasn't re-acted yet |
| `reopened` | `applied` | Agent re-acted after a bounce; awaiting re-review |
| `resolved` | (archived) | Closed |

**Resolve mechanics** (confirmed 2026-05-25):

- **Fences are removed from the prose** on resolve. A closed item needs no inline locator; the agreed text simply remains as plain prose (P1 - the doc stays canonical and self-contained).
- **Active and resolved records live in separate blocks.** `mw:log` holds *active* items (full detail, fences present in the prose); `mw:archive` holds *resolved* items (compact summaries, no fences). Both stay in-file (P1), but separating them keeps the live working set lean and scannable, and lets an agent focus on `mw:log` without wading through closed history (P2).
- **Resolved records compact to an agent-composed one-line summary, preserved not deleted.** The summary is written by the agent on resolve (not auto-derived from deltas) so it can capture the *why* - e.g. "Q3 -> Q4 -> H2 (marketing wanted H2 framing, not a specific quarter)" - which is the audit-trail value D3 cares about. The record is preserved (D3) in compact form (P2).

* * *
### D20 - Agent read / `markwise prompt`: what the agent receives and how it writes back (2026-05-25)
Walking the agent-read operation confirmed P1 holds: an agent can comprehend and act from the raw doc alone (readable JSON in `mw:log` + fences showing each span in context). `markwise prompt` is a *convenience*, not a requirement - it (a) filters to open/reopened items so the agent does not burn context on the `mw:archive` (P2), and (b) restates the response protocol.

**Decided:**

- **`prompt` always embeds the full response protocol.** Even an agent that has never seen markwise can comply. This maximizes P1's success metric (the set of models that participate with zero prior integration). The token cost (P2) is judged worth it.
- **Write-back: both direct edit and tool-applied patch are allowed (Option C).** Direct `.md` editing must always work - it is what satisfies P1 (the format is plain text; any in-file agent like Claude Code just edits it), with `lint` as the safety net for mistakes. A tool-applied patch path is an *optional* robustness layer for hosted / MCP agents; it is never required.
- **Semantic / mechanical division of labor.** The **agent** owns *semantic* fields: prose between fences, `agent_disposition`, thread reply bodies, payloads (`with`/`text`). The **tool** (`lint`/apply) owns *mechanical* fields: selector `hash`, `before`/`after` context, fence integrity. The agent edits meaning; the tool keeps fingerprints in sync afterward. This keeps P1 honest - the agent never needs to run a tool to participate, and if no tool ever runs, a stale hash only degrades selector *recovery* while the fence still works as the primary locator (D8/D18): graceful degradation, not breakage.

* * *
### D21 - Build order: protocol + CLI + agent prompt come first; previewer is deferred (2026-05-25)
v1 is built and validated in this order: (1) the **protocol**, (2) the **CLI** (`lint` / `status` / `prompt`), (3) the **agent note-authoring/acting prompt**. The web **previewer is explicitly deferred** until the protocol and CLI are proven.

**Why:** the previewer is a thin UI translation over the protocol - it turns a reviewer's clicks into the same `mw:` records an agent writes directly. If the protocol and CLI are correct, the previewer is mechanical; if they are wrong, a previewer built on them is wasted. Harden the format first.

**How we validate without a UI - dry runs.** The reviewer instructs an agent (e.g. Claude Code) in natural language to author notes into the file. Then a *separate, fresh* agent - no shared chat context - reads only the raw `.md` and must revise the prose, set dispositions, and reply in threads. A fresh agent succeeding is the direct test of P1 (self-containment); `lint` is the guardrail for malformed records.

**Note authoring is never hand-written HTML.** The reviewer's intent reaches the file through an agent (now) or the previewer (later); both are just authoring surfaces. The reviewer remains the source of intent in every case. See [[note]], [[reviewer]], [[agent]] in `CONTEXT.md`.

* * *
### D22 - Operation ownership: plain file-edit is the floor; the CLI is an optional layer (2026-05-31)
Every operation must be possible by **plain text edit of the `.md` file**. This is a direct consequence of P1: an agent that can only edit text (no shell, no MCP) must still be able to fully participate. Therefore **no operation is ever CLI-only**.

The CLI is an **optional convenience and safety layer**, not a requirement of any participant. It earns its keep unevenly across the verbs:

| Operation | How much the CLI helps | Why |
|---|---|---|
| Revise (prose) | None | Plain prose edit between fences; nothing to encode |
| Reply (thread) | A little | Append one well-formed message object |
| Set disposition | Barely | Flip one field |
| Create note | Real help | Must place fences + write a full record + selector |
| Resolve / Reopen | Strong help | Atomic multi-spot edit: strip fences from prose + move record `mw:log` -> `mw:archive` + write the compact summary (resolve), or reset `agent_disposition=none` (reopen) |

**Cost is not the reason for the split.** A local CLI is near-free to run. The reason is P1: if any operation were CLI-only, shell-less / hosted agents would be locked out, breaking "any agent can participate."

**Sequencing - write-helpers are deferred.** During the validation phase we *want* agents editing raw text, so the dry runs test the **format**, not the tooling. v1 CLI ships the read/check surface (`lint`, `status`, `prompt`, `export`/`strip`). Write-helpers for create / reply / resolve / reopen are deferred to a later production-hardening phase, added where hand-encoding proves fragile in practice. `lint` is the safety net for hand-authored mistakes in the meantime.

See [[note]] operations in `CONTEXT.md`; builds on P1, D20 (semantic/mechanical division of labor), D21 (build order).

* * *
### D23 - `mw:log` record container: JSONL, one note per line (2026-05-31)
The `mw:log` (and `mw:archive`) block holds **one JSON object per line** (JSONL), not one wrapping array or `{id: record}` map. Each line is a complete, independently-parseable note record.

**Why:**
- **P1 (self-containment):** a human or agent scanning the raw file reads one note per line - no deep-nested structure to parse mentally to find a single note.
- **Damage isolation:** a corrupted record (stray `-->`, bad edit) is one bad line; `lint` flags it and every other note stays valid. A single wrapping blob lets one syntax error invalidate the whole doc's review state.
- **Append- and edit-friendly (D22):** creating a note appends one line; editing a note touches one line without disturbing siblings.

**Cost accepted:** the block is not one valid JSON document, so the parser reads line-by-line rather than a single `JSON.parse`. Trivial to implement. `lint` validates each line and reports the offending line number on failure.

Builds on D22 (plain file-edit must be easy), D19 (`mw:log` vs `mw:archive` split).

* * *
### D24 - Field-key convention: terse keys, fully-spelled values (2026-05-31)
Record **keys** are terse (they are fixed scaffolding repeated on every note - the right place to spend the P2 budget). Record **values** stay fully spelled (`open`, `applied`, `declined`, `needs_clarification` - read constantly; readability serves P1). Keys must still be unambiguous; where a terse key would be cryptic we pick a clearer short form rather than a one- or two-letter abbreviation.

**Canonical top-level keys decided so far** (anchor / payload / thread sub-shapes finalized in later decisions):

| Key | Full meaning | Notes |
|---|---|---|
| `id` | note identity | stable, never changes (D15/D18) |
| `type` | note type | `comment` / `insert` / `delete` / `replace` |
| `state` | `review_state` (D11) | human-owned: `open` / `resolved` (D34 dropped `reopened`) |
| `disp` | `agent_disposition` (D11) | agent-owned: `none` / `applied` / `answered` / `declined` / `needs_clarification` (D35) |
| `anchor` | location + recovery selector | sub-shape per D12; finalized later |
| (payload) | new text for edits | key name finalized with the payload decision |
| `thread` | message list | sub-shape finalized later |

This supersedes the `sample.md` placeholder keys `review` / `agent`, which become `state` / `disp`. The full key table lives here in DECISIONS.md, not CONTEXT.md (which stays a plain-language glossary). Builds on P1, P2, D11.

* * *
### D25 - Revise is region-scoped: the agent must sweep a rewrite's blast radius and account for every open note in it (2026-05-31)
A revise triggered by one note can rewrite a region of prose that *other* open notes occupy. Those other notes face two dangers: (1) **mechanical orphaning** - their fences get deleted or scrambled by the rewrite; (2) **silent intent violation** - the worse one - the rewrite re-introduces text another note asked to delete, deletes text another note was questioning, or otherwise contradicts a co-located open ask without anyone acknowledging it. D5 ("close the loop on every note") assumed the agent acts on notes one at a time; this decision covers the case where acting on *one* note implicitly disturbs *others*.

**Term: blast radius** - the set of open notes whose anchors fall inside the region a revise rewrites. (Glossary: `CONTEXT.md`.)

**Rule - a revise is region-scoped, not note-scoped.** Before committing a large rewrite, the agent reads every open note in the blast radius and, for each, does exactly one of:
- **Honor** - fold its intent into the new text; set `disp=applied` + a thread reply saying how.
- **Decline** - if its intent conflicts with the triggering change; set `disp=declined` + reasoning.
- **Surface a conflict** - if two asks genuinely collide and only the reviewer can break the tie; set `disp=needs_clarification` + the question. The agent does **not** guess a winner.
- **Re-anchor** - if the note survives and is still relevant, move its fence onto the corresponding new text.

**Two guardrails (from existing decisions):**
- **No silent orphaning.** Every affected note gets explicit loop-closure (D5): disposition + thread reply. None may vanish unacknowledged. `lint` detecting a dangling fence is the mechanical backstop, not the primary mechanism.
- **The agent never auto-resolves.** `resolve` is human-owned (D11); the agent may apply, re-anchor, decline, and explain, but `review_state` stays for the reviewer even on notes the rewrite touched only incidentally.

**v1 boundary:** the agent's obligation is to *honor or surface* every blast-radius note, not to perfectly auto-reconcile conflicting intent. Genuine collisions route back to the human via `needs_clarification`. Builds on D5, D11, D18, D20; mostly an agent-prompt behavior plus a `lint` backstop.

* * *
### D26 - Minimal anchor for v1: `kind` + `hash` + `before` + `after` (2026-05-31)
The inline fence is the **primary locator** (D8/D18); the record's anchor selector is a **fallback** used only when the fence is missing or broken. Because every selector field is paid on every note (P2), v1 keeps the anchor minimal:

```json
"anchor":{"kind":"span","hash":"a3f2","before":"ships by ","after":" of next"}
```

- `kind`: `span` (wraps text) or `point` (an insertion location; no `hash`, since there is no wrapped text).
- `hash`: compact fingerprint of the selected text - drives drift detection (a mismatch flags the note `stale`/`needs_reanchor`, D12/D18).
- `before` / `after`: short surrounding-prose snippets to relocate the span.

**Deferred: heading path and block/paragraph index** (listed as options in D12). They mainly help second-order cases - a whole section moving, or duplicate text elsewhere - and the hash already makes any mislocation *detectable* rather than silently wrong. We add heading path only if dry-run drift shows `before`/`after` cannot recover in practice (evidence-driven, per P2). Builds on D8, D12, D17, D18.

* * *
### D27 - Edit payload: one shared `text` key, disambiguated by `type` (2026-05-31)
Insert and replace both introduce new text; they share **one key, `text`**. Delete and comment carry no `text` (delete removes its wrapped span; a comment's intent lives in the thread). This supersedes the `sample.md` placeholder where replace used `with` and insert used `text`.

The rule for any agent is one line: *"if the edit introduces new text, it is in `text`; the `type` field says whether that text is inserted at a point or replaces the wrapped span."* One key, one rule - leaner vocabulary (P2) and fewer rules a fresh model must infer from the raw file (P1 surface area). Payload text is escaped per D13/D17 (only the sequences that break HTML comments). Builds on D8, P1, P2.

* * *
### D28 - Thread message shape: `{by, at, body}`, `by` is `reviewer` or `agent` (2026-05-31)
A thread message has exactly three fields:

```json
{"by":"reviewer","at":"2026-05-24T14:00","body":"Use Q4 - auth slips to fall."}
```

- `by`: `reviewer` or `agent` - aligned to the CONTEXT.md glossary canon (replaces the `sample.md` placeholder `user`), so the raw file uses one consistent vocabulary (P1: fewer term mappings a fresh agent must infer).
- `at`: timestamp. Provides the chronological ordering D18 relies on ("later messages supersede earlier").
- `body`: the message text (escaped per D13/D17).

**No per-message id in v1.** Messages are positional within a note's `thread` and are never individually cross-referenced. An id would be paid on every message (P2) for a capability nothing in v1 uses; add it only if message-level operations (edit/delete one reply) become real. Builds on D18, P1, P2.

* * *
### D29 - Archive record: compact summary only, no verbatim thread (2026-05-31)
When a note resolves (D19), its record moves from `mw:log` to `mw:archive`, fences are stripped from the prose, and it compacts to:

```json
{"id":"s1","type":"replace","state":"resolved","at":"2026-05-26T09:00","summary":"Q3 -> Q4 -> H2 (marketing wanted H2 framing, not a specific quarter)"}
```

- **Keep:** `id` (identity preserved), `type` (what kind of feedback the doc needed - the D3 audit signal), `at` (resolution time, for ordering), `summary` (the agent-composed one-line *why*, D19), and `state":"resolved"` explicit (one cheap field keeps each line self-describing - P1 - even though the block name implies it).
- **Drop:** `anchor` (no fence remains), `disp` (terminal), and the **full verbatim `thread`**.

The agent-composed `summary` is the unit of audit memory: it preserves the *meaning* of past feedback (D3) at a fraction of the tokens, while `mw:archive` stays lean so the live working set in `mw:log` is what an agent reads (P2/D19). Retaining verbatim threads forever was rejected because it bloats the file against P2 for a replay need v1 does not have; if ever required it is a deferred cold-storage feature. Builds on D3, D19, P1, P2.

* * *
### D30 - Block envelope: `mw:log` and `mw:archive` HTML-comment blocks, versioned `v=1` (2026-05-31)
Records live in two HTML-comment blocks at the **end of the file** (D2 footer layout, D19 split):

```
<!-- mw:log v=1
{ ...active note record... }
{ ...active note record... }
-->

<!-- mw:archive v=1
{ ...compact resolved record... }
-->
```

- The opening marker (`<!-- mw:log v=1`) and closing `-->` each sit on their own line; records are JSONL between them (D23).
- `v=1` is the **schema version**, bumped only on a breaking format change so a reader/`lint` can refuse or migrate an unknown version (the versioned envelope D13 mandated).
- A file has **zero or one** `mw:log` and **zero or one** `mw:archive` block. `mw:log` holds active items (with fences in the prose); `mw:archive` holds resolved summaries (no fences). Builds on D2, D13, D19, D23.

* * *
### D31 - Edits act on intent and leave grammatical prose, not literal span-only removal (2026-05-31)
A suggested edit is a **semantic instruction with a span as its starting anchor**, not a dumb character-range operation. When applying a delete or replace, the agent removes/swaps the wrapped span **and repairs the seam** so the result reads as natural, grammatical prose. Surfaced by the cold dry run (2026-05-31): a literal span-only delete of "large and growing" left `"The market is ."`, which a human reviewer would never want.

**Why:** the thread is authoritative for *intent* (D18) and the human is the customer who must re-read the doc cleanly (D1). "Cut it" means "make this claim go away cleanly," not "leave a dangling fragment."

**Safety:** the agent records what it did (`disp`) and replies in-thread, so any over-trim is visible and the human can `reopen`. Rejected literal span-only deletes because they push perfect pre-selection onto the reviewer for no benefit. Builds on D1, D18; an agent-prompt behavior rule.

* * *
### D32 - Seam repair is by removal/restructuring, never by invention (refines D31) (2026-05-31)
The "repair the seam" rule (D31) needs a guardrail. The second dry run (2026-05-31, *with* the prompt block) deleted "large and growing" and, to fix the grammar, **invented** "substantial" - reintroducing an unsubstantiated claim, the exact thing the reviewer cut. Repairing by invention can silently violate intent.

**Rule:** the agent repairs a seam **only by removing or restructuring existing text**, never by inventing new substantive content.
- If grammar cannot be restored without adding a new claim, the agent removes the **orphaned scaffolding** too (e.g., drops the whole sentence "The market is large and growing.") rather than fabricating a predicate.
- If removing that scaffolding would drop meaning the reviewer plausibly wanted kept, the agent sets `disp:"needs_clarification"` and asks - it does not guess with invented prose.

**Why:** the seam repair exists to keep the doc readable (D1), not to license new claims the reviewer never approved. Restructuring-by-removal always stays faithful to intent; `needs_clarification` (D11) is the safety valve for the ambiguous case. Builds on D31, D1, D11.

* * *
### D33 - First concrete `lint` rule: no mw records outside their comment block (2026-05-31)
The note-authoring dry run (2026-05-31) mis-encoded the log block as a *paired* tag
(`<!-- mw:log v=1 -->` ... `<!-- /mw:log -->`) with the JSONL records sitting **outside** the
comment - i.e., as visible literal JSON in the rendered document, breaking clean preview (D9). A
smart agent conflated the single multi-line block comment (D30) with the paired inline-marker
pattern (D8).

**Lint rule (v1):** every `mw:` record must live **inside** a single multi-line HTML comment
(`<!-- mw:log v=1` ... `-->` / `<!-- mw:archive v=1` ... `-->`). `lint` flags: (a) any record-shaped
JSON line outside an `mw:` comment block; (b) a `<!-- /mw:log -->` or `<!-- /mw:archive -->`
paired-close form (the block does not use a closing tag); (c) an `mw:log` opener that is closed on
its own line (`<!-- mw:log v=1 -->`) yet followed by record lines. This is the first evidence-backed
`lint` rule (build order D21 item 2). The instruction fix lives in `AUTHOR_PROMPT.md`; `lint` is the
mechanical backstop. Builds on D8, D9, D30, D21.

* * *
### D34 - Resolve is terminal; there is no reopen; iteration happens within `open` via turn-taking (2026-05-31)
Stepping back over the full lifecycle (2026-05-31) collapsed the state model. A resolved note is **done, permanently** - there is no path back to active. Everything `reopen` was for (another pass after the agent acted) happens *while the note is still open*, as one more turn in its thread. This supersedes the `reopened` review_state (D11), the reopen mechanics and disposition-reset in D19, and the reopen clarification in D18.

**review_state collapses to two values:** `open` and `resolved`. `resolved` is terminal and triggers archive (D19/D29). `reopened` is removed.

**The engine - "who spoke last."** When an agent receives the doc it reads every `open` note but acts only on those where **the reviewer spoke last** (a reviewer message sits on top of the agent's previous action). This one rule covers the whole loop:
- brand-new note (thread ends with the reviewer's opening message) -> agent's turn;
- agent applied/declined/asked and the reviewer has not replied (the agent's reply is last) -> agent **skips** it - it is the reviewer's turn to resolve or push back;
- reviewer replied on top of the agent's action ("no, do it" / "make it H2 instead") -> reviewer is last -> agent acts again, still inside `open`.

**Disposition is a label, not the trigger.** `disp` (`applied` / `declined` / `needs_clarification`) records the agent's *last* action; it does not gate the loop. The trigger is purely (`state==open` AND reviewer spoke last). Consequence: between a reviewer push-back and the next agent run a note can read `disp:applied` while actually being the agent's turn - that is fine; "who spoke last" is the source of truth for what is pending, and the agent overwrites `disp` on its next pass.

**One edge - acknowledgement without resolve.** A reviewer who replies "looks good" but does not resolve leaves their message last, so the agent is nominally on the clock. The agent reads *intent*, sees nothing is asked, and takes no prose action (a brief acknowledgement at most). Lifecycle is unaffected; this is intent-reading, not a state-machine hole.

**Revisiting a closed note = a new note.** Changed your mind after resolving, or new information arrived? The reviewer creates a **fresh note** on the same text and the cycle starts clean. This is strictly simpler than resurrecting compacted state and costs only one new note.

**Why this is the right call:**
- It matches how review threads actually behave - the back-and-forth is the *open* phase; closing is a deliberate, final act.
- It **dissolves** the lossy-archive problem: because nothing is ever reconstituted from `mw:archive`, the compact summary (D29) is unambiguously safe - a pure audit trail, never a reopen source. No need to make the archive heavier (P2 protected).
- It shrinks the state machine to two lifecycle states and one trigger rule - fewer rules a fresh agent must infer (P1 surface area).

**Ripples:** the `state` value set drops `reopened` (affects D11, D19's matrix, D24's key table). `markwise status` reports two lifecycle buckets (`open` / `resolved`) plus disposition counts, not three. The **Reopen** glossary term in `CONTEXT.md` is removed. Builds on D11, D18, D19, D29; supersedes their reopen provisions.

* * *
### D35 - Add `answered` disposition for comments handled without a prose change (2026-05-31)
The `agent_disposition` set (D11) had no value for a pure **comment** the agent answers in the thread without editing prose - `applied` literally means "I changed the prose." Add **`answered`**.

Disposition becomes **action-based** - each value tells the reviewer where the agent's response landed:

| `disp` | Meaning | Where the reviewer looks |
|---|---|---|
| `none` | not acted yet | - |
| `applied` | agent changed the prose | re-read the doc |
| `answered` | agent replied, no prose change | read the thread |
| `declined` | agent refused, explained | read the thread, then decide |
| `needs_clarification` | agent is blocked, asked a question | answer it |

The disposition follows the **action, not the note `type`**: a comment that *triggers* an edit is still `applied` (the prose moved), while a discussion-only comment that gets answered is `answered`. So `applied` now means strictly "the prose moved." Cost is one fully-spelled enum word (negligible, P2); the gain is that the disposition alone tells the reviewer whether the document text changed, readable straight from the raw record (P1). Updates D11's value set and D24's `disp` row; builds on D11, D24.

* * *
### D36 - `lint` v1 scope: structural integrity + drift flagging + minimal lifecycle checks (2026-05-31)
v1 `lint` covers three tiers of checks, bounded to what the dry runs proved we need and stopping short of the deferred drift-recovery algorithm. This is the spec the CLI codes against (build order D21 item 2).

**Tier 1 - Structural integrity.** Block envelope (D30, D33); JSONL record syntax with offending-line reporting (D23); per-record schema and allowed value sets (D24, D34, D35); payload presence rule - `text` iff `insert`/`replace` (D27); anchor shape per `kind` (D26); thread shape `{by, at, body}` (D28); comment-terminator escaping (D13/D17); id uniqueness; marker <-> record correspondence; fence balance (no dangling open/close); marker-shape-matches-type; no markers inside code fences (D8/D14); archived records carry no inline marker.

**Tier 2 - Anchor health.** Recompute each span's `hash` from the currently-wrapped text and flag mismatches `stale` / `needs_reanchor` (D12/D18); check `before`/`after` context. The full selector-*recovery* matching algorithm is deferred (open Q3, pending drift evidence). Hash maintenance lands in `lint` because D20 assigns mechanical-field upkeep to the tool, not the agent.

**Tier 3 - Minimal lifecycle.** A `mw:log` record must be `state:open` and a `mw:archive` record `resolved` (D19/D34); a `declined` / `needs_clarification` note should carry an agent reply (loop closure, D5); suspicious `disp`/`type` combinations are flagged. **Explicitly not flagged:** "the reviewer spoke last and the agent has not responded yet" - normal pending state under D34, which belongs to `status`, not `lint`.

Deferred to later hardening: full selector recovery (open Q3), and exhaustive semantic validation. Builds on D7, D10, D33, and the schema decisions D23-D35.

* * *
### D37 - `lint` severity and exit model: two-tier by consequence, `--strict` to escalate (2026-05-31)
Severity tracks **consequence, not tier**:
- **error** - the file is unparseable, the review state is corrupted, or raw markup leaks into a normal markdown preview (the doc is broken or *looks* broken). Non-zero exit, so CI and scripts catch it.
- **warning** - the file is valid and renders clean, but something is degraded, risky, or almost certainly a mistake (stale hash, a `declined` note with no agent reply, a block in the wrong place). Reported; exit zero by default.
- **`--strict`** makes warnings also fail (non-zero exit) for a clean-bill-of-health CI gate.

Rejected three-tier (an `info` level has nothing real to carry in v1; advisory counts belong to `status`) and single-tier (too blunt - a cosmetic stale hash blocking like corrupted JSON trains people to ignore `lint`). Builds on D36, D10.

* * *
### D38 - `lint` repair: `--fix` mends mechanical fields only, read-only by default (2026-05-31)
v1 `lint` is **read-only by default**. With `--fix` it repairs **mechanical fields only** - recompute a stale `hash`, refresh `before`/`after` context - and never touches semantic content (prose, `disp`, `state`, threads, `text`). This realizes the tool side of D20's mechanical/semantic division ("tooling keeps fingerprints in sync"). Mechanical-only scope means `--fix` cannot corrupt meaning; the read-only default keeps `lint` a checker people trust (no surprise edits in CI). Rejected report-only (leaves D20's promised upkeep unbuilt) and always-auto-fix (silent rewrites violate least-surprise). Builds on D20, D36, D37.

The full `lint` rule catalog (every check, tier, severity, fixability) is consolidated in `LINT_SPEC.md`, derived from D33 and D36-D38.

* * *
### D39 - `markwise lint` is built in TypeScript/Node; canonical hash is SHA-256 first 8 hex (2026-05-31)
The CLI is implemented in **TypeScript on Node** (distributed via npm; `npx markwise lint doc.md`). Chosen because Markwise is a markdown tool whose parsing ecosystem lives in JS, the agents that consume it already run in Node, and real types let the locked record schema (D23-D35) be enforced by the compiler. Rejected Python (readability edge did not outweigh ecosystem fit) and Go (single-binary distribution, but not installed and the schema work plays to TS's strengths).

Two implementation specifics the spec left open, now fixed:
- **Anchor hash = first 8 hex chars of SHA-256** of the exact fence-wrapped text (`src/hash.ts`). Short per D24 but collision-resistant enough for drift detection (L201). `sample.md`'s placeholder hashes (`a3f2`, `9c1d`) were replaced with real values (`9fc58f1a`, `d55f3029`) so `sample.md` is a genuinely clean reference doc and doubles as an integration test.
- **Test approach = one broken-file fixture per rule** (`test/rules.test.ts`), plus `sample.md` clean-integration and `--fix` round-trip tests (`test/fix.test.ts`). 37 tests; all green. The fixture table is the executable spec - a new rule means a new fixture first.

Code layout: `src/parse.ts` (tolerant parser -> descriptive model), `src/lint.ts` (all 24 rules, L101-L304), `src/fix.ts` (mechanical `--fix`), `src/cli.ts` (arg parse, severity-based exit codes per D37). Builds on D21, D23-D38, `LINT_SPEC.md`.

* * *
### D40 - First review surface: web view first; VS Code extension deferred; the lint core stays a reusable library (2026-05-31)
**Closes open questions #2 and #7 (previewer surface).** When the deferred UI phase (D21) begins, the **first review surface is a terminal-launched local web view** (following Roughdraft's proven `open <file>` workflow, D16) - not a VS Code extension or a desktop app. The **VS Code extension is explicitly parked for a later phase**, after the protocol, CLI, and first web surface are proven. This was concluded in a separate brainstorming thread; it is recorded here so it stops living as an open question.

**Why web view first:**
- It matches D21's "harden the format first" sequencing - the surface is thin UI over a proven protocol.
- A browser view is the most universal surface (any device, no editor lock-in) and reaches the full D1 audience ("any human reviewing any agent-written doc"), including reviewers who never open an IDE. A VS Code extension serves a narrower, dev-centric slice.
- It mirrors Roughdraft's already-validated `open` / "Done Reviewing" flow (D16), so we build on a known-good interaction model.
- VS Code is not lost - it becomes cheap to add later precisely because of the reusable-core point below.

**The lint/validate core is intentionally a reusable library; the CLI is thin, disposable glue.** `parse` -> `lintText` / `fixText` are pure `string -> data` functions with no filesystem, process, or argv coupling (only `src/cli.ts` touches those). Every future surface - `status`, the web view, and any eventual VS Code extension - imports the same core instead of re-implementing the parse-and-validate logic. This realizes D20's mechanical/semantic split as an actual code boundary and is what makes the deferred VS Code extension "mostly UI glue" rather than a second implementation.

**Two reminders for whoever builds the first UI:**
- **Expose a library entry point** (an `index.ts` re-exporting `parse`, `lintText`, `fixText`, and the types, plus `main` / `exports` in `package.json`) when that second consumer arrives. Today the package advertises only a `bin`; add the library entry at first reuse, not speculatively.
- **`node:crypto` is the one non-portable line.** `src/hash.ts` uses Node crypto - fine for the CLI and a (Node-based) VS Code extension, but a pure-browser web view needs a one-line swap to Web Crypto (`crypto.subtle.digest`). Plan it as a deliberate swap, not a surprise.

Builds on D1, D16, D20, D21, D39; closes open questions #2 and #7.

* * *
### D41 - CLI surface built: `status`, `prompt`, `export`; export strips all and never touches the original (2026-05-31)
`status`, `prompt`, and `export` are now implemented in TypeScript/Node alongside `lint`, each a thin CLI wrapper over a pure `string -> data` core module (the D40 reusable-core discipline), built test-first.

- **`status`** (`src/status.ts`): open/resolved counts plus the D34 "who spoke last" turn split - **waiting on you** (agent responded; resolve or push back) vs **waiting on the agent** (brand-new note, or you replied on top of the agent's action), with `needs_clarification` surfaced as "needs your answer". `disp` only flavors the reason text; the turn is decided purely by who spoke last. Always exits 0 (informational).
- **`prompt`** (`src/prompt.ts`): emits the `AGENT_PROMPT.md` block (or `AUTHOR_PROMPT.md` with `--author`) with `<CURRENT_TIME>` filled in, a list of the notes waiting on the agent, then the document - one bundle to hand any model. The instruction templates stay canonical in the `.md` files (added to the package `files`); the CLI fills them, it does not own them. The timestamp is injected into the pure builder so it stays testable.
- **`export` / `strip`** (`src/strip.ts`): resolves the **CLI half of open Q5**. Removes ALL Markwise data (both blocks plus every inline marker, keeping the wrapped prose) and writes the clean copy to stdout or `--output`. It **never modifies the original**, so it cannot destroy review state - the safe-by-default sharing workflow D10 asked for. The previewer-warning half of open Q5 (warn when hidden feedback remains) stays deferred with the previewer (D40).

Test count 38 -> 52 (status / prompt / strip each with their own fixtures). Builds on D7, D10, D11, D20, D34, D40; resolves the CLI portion of open Q5.

* * *
## Open questions / next steps

### Immediate next step (2026-05-31)
**DONE - `markwise lint` is built and green (see D39).** All 24 rules (`L101`-`L304`) are implemented in TypeScript/Node with one broken-file fixture per rule plus a clean `sample.md` integration test and `--fix` round-trip tests (37 tests passing). `markwise lint <file> [--fix] [--strict] [--json]` runs with severity-based exit codes (D37). _Original plan (kept for the record):_ start with a broken-file test fixture per rule so the spec is validated as the code is written and `lint` has a test harness from line one.

**Next:** ~~`status` output format, then `export`/`strip` safety defaults (open Q5), then `prompt` wiring.~~ **DONE - all three built (see D41); 52 tests passing.** The CLI surface (`lint` / `status` / `prompt` / `export`) is complete. **Next is the web previewer** (D40: read-only web view first); compact before starting it.

1. **Operations walkthrough (next):** enumerate every operation markwise must support (create comment, reply, change state, agent-responds, resolve, suggested-edit accept/reject, render, export, lint, status...) and verify the HTML-comment format cleanly handles each one. _Design the minimal_ `mw:` _schema to serve the operations - don't design the schema in a vacuum._
  
2. **Previewer surface:** ~~terminal-launched web view (like Roughdraft's `roughdraft open`), VS Code extension, or standalone desktop app? This choice shapes what we build first.~~ **Resolved by D40 (2026-05-31): web view first; VS Code deferred.**
  
3. **Footer log schema + accept/reject flow:** D8 fixed the *inline marker* shapes for insert / delete / replace; still open is the exact footer-entry schema (fields, payload format) and how a human accepts or rejects a suggested edit.
  
4. **Comment ID scheme:** how IDs are generated and kept stable.
  
5. **Anchor drift (op 21):** what happens to a fence when surrounding prose is edited or a tool reformats the file (e.g. one fence dropped, or fences separated from their text). Related to D8; `lint` detecting a dangling fence (open without close) is a likely safeguard.
  

### Updated open questions after D9-D16

1. **Operation model:** what is the exact list of v1 operations, including human actions, agent actions, suggested-edit accept/reject, review completion, export/strip, import/export CriticMarkup, and stale-anchor repair?
2. **Footer schema:** should the footer contain one encoded JSON index, one comment record per item, or a hybrid? The answer should follow from the operation model.
3. **Selector recovery:** what exact selector fields and matching algorithm are good enough for v1?
4. **Closure semantics:** how should the UI and CLI present `agent_disposition` versus `review_state` so humans do not mistake "agent applied" for "reviewer resolved"?
5. **Export safety:** ~~should `markwise export` default to stripping all Markwise data, and should the previewer warn when hidden feedback remains in a file intended for sharing?~~ **CLI half resolved by D41 (2026-05-31): export strips all data, writes to stdout/`--output`, never touches the original. Previewer-warning half stays deferred with the previewer (D40).**
6. **Roughdraft interop:** which subset of Roughdraft-flavored CriticMarkup should Markwise import/export first?
7. **Previewer surface:** ~~should v1 be a terminal-launched local web view first, following Roughdraft's proven workflow, before considering a VS Code extension or desktop app?~~ **Resolved by D40 (2026-05-31): yes - web view first, VS Code deferred.**

* * *
## Review log
- **c1** (resolved 2026-05-24) - reviewer asked to remove all em-dashes and use `-` instead. Applied doc-wide; em-dashes replaced with hyphens, the `<->` arrow kept for the manager/knowledge-worker relation.
