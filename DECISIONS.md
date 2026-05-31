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
D3 and D5 currently blur ownership. D3 says `addressed` and `declined` are human-owned transitions, while D5 says the agent transitions comments to `addressed`, `declined`, or `needs-clarification`.

Replace the single state model with two related concepts:

- `agent_disposition`: what the agent says it did with the feedback.
- `review_state`: whether the human considers the feedback loop closed.

Initial values:

| Field | Values | Owner |
|---|---|---|
| `agent_disposition` | `none`, `applied`, `declined`, `needs_clarification` | agent |
| `review_state` | `open`, `resolved`, `reopened` | human |

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
## Open questions / next steps
1. **Operations walkthrough (next):** enumerate every operation markwise must support (create comment, reply, change state, agent-responds, resolve, suggested-edit accept/reject, render, export, lint, status...) and verify the HTML-comment format cleanly handles each one. _Design the minimal_ `mw:` _schema to serve the operations - don't design the schema in a vacuum._
  
2. **Previewer surface:** terminal-launched web view (like Roughdraft's `roughdraft open`), VS Code extension, or standalone desktop app? This choice shapes what we build first.
  
3. **Footer log schema + accept/reject flow:** D8 fixed the *inline marker* shapes for insert / delete / replace; still open is the exact footer-entry schema (fields, payload format) and how a human accepts or rejects a suggested edit.
  
4. **Comment ID scheme:** how IDs are generated and kept stable.
  
5. **Anchor drift (op 21):** what happens to a fence when surrounding prose is edited or a tool reformats the file (e.g. one fence dropped, or fences separated from their text). Related to D8; `lint` detecting a dangling fence (open without close) is a likely safeguard.
  

### Updated open questions after D9-D16

1. **Operation model:** what is the exact list of v1 operations, including human actions, agent actions, suggested-edit accept/reject, review completion, export/strip, import/export CriticMarkup, and stale-anchor repair?
2. **Footer schema:** should the footer contain one encoded JSON index, one comment record per item, or a hybrid? The answer should follow from the operation model.
3. **Selector recovery:** what exact selector fields and matching algorithm are good enough for v1?
4. **Closure semantics:** how should the UI and CLI present `agent_disposition` versus `review_state` so humans do not mistake "agent applied" for "reviewer resolved"?
5. **Export safety:** should `markwise export` default to stripping all Markwise data, and should the previewer warn when hidden feedback remains in a file intended for sharing?
6. **Roughdraft interop:** which subset of Roughdraft-flavored CriticMarkup should Markwise import/export first?
7. **Previewer surface:** should v1 be a terminal-launched local web view first, following Roughdraft's proven workflow, before considering a VS Code extension or desktop app?

* * *
## Review log
- **c1** (resolved 2026-05-24) - reviewer asked to remove all em-dashes and use `-` instead. Applied doc-wide; em-dashes replaced with hyphens, the `<->` arrow kept for the manager/knowledge-worker relation.
