# Markwise

The shared language of Markwise: a human-agent review layer for markdown. This glossary is the source of truth for what each term means. Code, CLI help, UI labels, and docs should all use these words the same way.

## Language

### The unit of review

**Note**:
The atomic unit a reviewer creates against a document. Has an `id`, a `type`, an anchor, a `thread`, and lifecycle states. Every other concept hangs off a note.
_Avoid_: comment (as a generic word), item, feedback (as a precise term), annotation.

**Comment**:
A `type` of note that is discussion only - it raises a question or observation but proposes no change to the text.
_Avoid_: using "comment" to mean any note; it is one specific kind.

**Suggested edit**:
The umbrella term for the three note types that propose a concrete text change: **insert**, **delete**, and **replace**. A note is therefore *either* a comment *or* a suggested edit.
_Avoid_: "suggestion" when you mean a comment; "edit" alone (ambiguous with the reviewer typing).

**Insert / Delete / Replace**:
The three suggested-edit types. `insert` adds text at a point; `delete` removes a wrapped span; `replace` swaps a wrapped span for new text held in the record.

**Thread**:
The ordered, chronological list of messages (from the reviewer and the agent) attached to one note. The thread is authoritative for *intent* - later messages supersede earlier ones (see DECISIONS D18).
_Avoid_: conversation, discussion (as protocol terms).

### The participants

**Reviewer**:
The human who reads the document and creates notes. The customer of the product.
_Avoid_: user (too vague), commenter.

**Agent**:
The AI that authored the document and that revises it in response to notes. Model-agnostic (DECISIONS D6).
_Avoid_: author (acceptable informally, but "agent" is canonical), bot, AI (too vague).

### Operations

The core verbs are **orthogonal** - each acts on a different part of a note, and an agent composes them as the note requires. There is deliberately *no* separate "accept / reject a suggested edit" verb; that collapses into **resolve** / **reopen**.

**Revise**:
The agent changes the document's **prose**. Triggered by any note that needs a text change (a suggested edit, or a comment asking for one). Does not include answering in the thread.
_Avoid_: "edit" (ambiguous), "apply" (that is a disposition value, not the act).

**Reply**:
Add a message to a note's **thread**. This is how a comment is *answered*, a decline is *explained*, or clarification is *requested*. Either party can reply.
_Avoid_: "comment" as a verb, "respond" (reserve for the loop as a whole).

**Set disposition**:
The agent records what it did with a note on its own state axis: `applied` / `declined` / `needs_clarification`. (Agent-owned; DECISIONS D11.)

**Resolve**:
The reviewer closes a note, accepting the outcome. For a suggested edit, **resolve = accept**. Mechanics in DECISIONS D19.

**Reopen**:
The reviewer bounces a resolved note back for another pass. For a suggested edit, **reopen = reject-and-ask-again**. Resets `agent_disposition` to `none` (DECISIONS D19).

### Informal words

**Feedback**:
Acceptable in marketing/pitch prose to mean "the notes collectively." Never used as a precise protocol term - use **note** in any spec, schema, CLI, or UI context.

## Flagged ambiguities

- **"Comment" was overloaded** (resolved 2026-05-25): the early docs used "comment" for both the generic unit and the discussion-only type. Resolution: the generic unit is **note**; **comment** is reserved for the discussion-only type.

## Example dialogue

> **Reviewer:** I left three notes on the PRD.
> **Agent:** Got it - two suggested edits and one comment?
> **Reviewer:** Right. The replace on the timeline, the delete on the market claim, and a comment asking why we dropped the mobile scope.
> **Agent:** I applied the replace, declined the delete with my reasoning in its thread, and answered the comment's thread with a question back.
> **Reviewer:** I'll resolve the replace. The comment thread isn't closed yet - I need to reply before you act again.
