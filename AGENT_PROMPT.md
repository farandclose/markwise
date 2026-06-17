# Markwise - agent instructions

This is the model-agnostic instruction block that `markwise prompt <doc>` emits ahead of the
document. Any agent can follow it with no prior Markwise knowledge (DECISIONS D20). The CLI fills
in `<CURRENT_TIME>` and may append a filtered list of the currently open notes.

---

## What this is

This markdown file carries human **review feedback** embedded as HTML comments (invisible in normal
markdown preview). Your job: act on each open note that is **waiting on you**, then reply so the
reviewer can see what you did. Everything you need is in the raw file - no other tool is required.

## Which notes are waiting on you

Act on a note only if it is `open` **and the reviewer spoke last** in its `thread` (their message
sits on top of your previous action). That covers a brand-new note and one the reviewer has bounced
back for another pass. If your own reply is the last message in a note's thread, it is the
**reviewer's** turn (to resolve it or push back) - leave that note untouched. A `resolved` note is
closed for good; never touch it.

## How feedback is stored

- In the prose, small markers wrap or point at the text a note is about:
  - a **span**: `<!-- mw:ID -->...text...<!-- /mw:ID -->`
  - a **point** (for insertions): a single `<!-- mw:ID -->`
- At the **end of the file**, a `<!-- mw:log v=1 ... -->` block holds one JSON record per line
  (JSONL). Match each record to its marker by `id`.
- A record has: `id`, `type` (`comment` | `insert` | `delete` | `replace`), `state` (human-owned),
  `disp` (yours), `anchor`, `text` (new text, for `insert`/`replace` only), and `thread`
  (messages `{by, at, body}`).
- The inline marker is the **primary** way to locate a note. `anchor.hash` / `before` / `after`
  are only a recovery aid if a marker goes missing - you do not maintain them.

## The three things you may do

1. **Revise** - change the document's prose to satisfy a note.
2. **Reply** - append a message to a note's `thread`: `{"by":"agent","at":"<CURRENT_TIME>","body":"..."}`.
   Always sign as `agent`.
3. **Set disposition** - set the note's `disp` to record what you did.

## What you must NOT do

- Do **not** set or change `state`. That field belongs to the human reviewer; resolving a note is
  their terminal action. Leave it exactly as you found it.
- Do **not** remove the inline markers / fences. They stay until the human resolves the note.
- Do **not** move records to an archive. That happens when the human resolves.
- Do **not** recompute `hash` or `before` / `after`. Leave them; tooling keeps them in sync.

## For every open note that is waiting on you, do exactly one of

- **Apply** - revise the prose, set `"disp":"applied"`, and add a short reply saying what you did.
- **Answer** - if the note is a comment that only needs a reply (no prose change), reply in the
  thread and set `"disp":"answered"`. (If a comment asks for a wording change, that is an **Apply**,
  not an Answer - the disposition follows what you did to the prose.)
- **Decline** - leave the prose, set `"disp":"declined"`, and reply explaining why.
- **Ask** - if the request is unclear, or two notes conflict, set `"disp":"needs_clarification"`
  and reply with your question. Do **not** guess a winner.

## How to act well

- The `thread` is **authoritative for intent**; later messages override earlier ones. Act on the
  latest instruction, not a stale `text` value.
- Edits act on **intent, not literal character ranges**: after a delete or replace, leave
  grammatical, natural-reading prose - repair the seam (DECISIONS D31). But repair **only by
  removing or restructuring existing text, never by inventing new substantive content** (D32). If
  grammar cannot be restored without adding a new claim, remove the orphaned scaffolding too (e.g.,
  drop the whole sentence). If that would lose meaning the reviewer plausibly wanted kept, set
  `"disp":"needs_clarification"` and ask - do not invent.
- If satisfying one note requires rewriting a region that contains **other open notes**, you must
  account for each of them too - honor it, decline it, ask about it, or re-position its marker -
  never silently delete or contradict another open note (its "blast radius"; DECISIONS D25).
- Keep `text` truthful: if you applied something different from the original suggestion, update
  `text` to match what you actually wrote.
- Avoid the sequences `-->` and `--` inside any `body` or `text` value (they break HTML comments).
- Use this timestamp for every `at` you write: `<CURRENT_TIME>`.
- If you were handed off from a live preview (it is still open), the reviewer may be watching your
  edits land in real time. Work in tidy, incremental steps so the document stays readable as you go.

## When you are done

Output the full updated file. Every note you acted on should now have a `disp` other than `none`
and an `agent` reply in its `thread`. Leave every `state` untouched for the human to resolve.
