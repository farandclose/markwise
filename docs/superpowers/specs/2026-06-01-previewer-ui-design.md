# Markwise Previewer UI - v0 Design (Preview Mode)
Status: Approved in brainstorm 2026-06-01. Next step: implementation plan (writing-plans). Surface: the reviewer-facing previewer - the third pillar of Markwise (protocol + CLI + previewer).
## Scope
This spec covers the v0 reviewer-facing **previewer** ("preview mode") - the terminal-launched local **web view** chosen in DECISIONS D40. It defines the opening read, how notes are revealed and rendered, how a reviewer creates and responds to notes, and how the document is handed back to the agent.

It deliberately does **not** redesign the protocol, CLI, or agent prompts. The previewer is a thin UI over the existing `mw:` protocol (D21): a reviewer's clicks produce the same records an agent writes by hand. It reads/writes the same `.md` file in place.

Out of scope for v0 (see "Deferred" at the end): the archive/resolved browse view, discard-a-note, touch interactions, the finalized per-note-type color language, who-spoke-last status indicators, navigation/keyboard beyond add-comment, and any deeper (non-clipboard) agent integration.
## Principles carried in
- **Clean read is the baseline** (D9 / P1). Review chrome must earn its place against a clean, centered, generously-spaced document.
  
- **The previewer is an overlay.** The document is the agent's prose; notes are an overlay anchored to it; note content lives in the right-hand rail, not jammed into the prose (D2).
  
- **One adaptive surface.** A document either has open notes or it does not; the previewer reflects whatever is in the file. There is no manual "review mode vs author mode" toggle.
  
- **Reviewer states intent; the agent revises prose** (D5 / D31). The previewer captures intent (comments anchored to text); it is not a prose editor.
  
## 1. Opening state
The previewer opens as just the document: a centered (~640-680px) reading column, generous line-height, no review chrome competing with the prose. This is the anchor everything else is measured against. It holds in both first-class cases (D1-style symmetry):

- a fresh document with no notes yet (you opened it to read and start leaving notes), and
  
- a document that already has open notes (you opened it to review the agent's responses).
  

In both cases the doc reads clean at open; any review signal is quiet (see the counter).
## 2. Toolbar
A single top bar:

- **Left:** the "Markwise" wordmark + the document title.
  
- **Right:** the open-notes counter (which is also the reveal toggle, section 3) and the "Done reviewing" action (section 11). Exact placement of "Done reviewing" is a refinable detail.
  
## 3. The notes counter and toggle
- The counter shows the count of **all open notes** in the document (not a who-spoke-last to-do count - that distinction was considered and deferred).
  
- The same control is the **toggle** between two states:
  
  - **Clean read** (default at open): the document only; the counter is the sole trace of review.
    
  - **Notes revealed:** fences light up in the prose and the notes rail appears on the right.
    
- Toggling off returns to the clean read.
  
## 4. Note rendering (by anchor and type)
When notes are revealed, each note is rendered in the prose according to its anchor and type. (The exact color language per type is NOT finalized in v0; the treatments below are directional placeholders to be designed.)

- **Span notes** wrap text and get an inline highlight:
  
  - `comment` on a span: a tint on the wrapped text.
    
  - `replace`: a tint/underline on the wrapped (old) text.
    
  - `delete`: the wrapped text shown struck through.
    
- **Point notes** anchor at a position (no text to wrap) and render as a **pillar**: a thin highlighted vertical bar sitting exactly at the anchor.
  
  - `insert` is the primary point case (proposing text where none exists).
    
  - A point note is created by selecting a caret/gap (sections 7-8); whether it reads as an `insert` (add text here) or a point `comment` follows the reviewer's intent, which the agent interprets.
    
- **Active note shading.** Exactly one note can be active at a time. The active note's fence/pillar takes a **deeper shade** than the resting reveal-highlight, visually linking it to its open card.
  
## 5. Notes rail
- Notes appear as cards in a right-hand rail, in document order.
  
- **One active note at a time.** Clicking a card makes it active: it expands to show the full thread (every message with author + timestamp), a reply box, and the note actions. Activating one card collapses the previously-active one.
  
- **Bidirectional activation.** Clicking a highlighted span/pillar in the prose activates its card, and clicking a card activates (and deep-shades) its fence. It is one shared "active" state reachable from either side.
  
- Clicking empty space, or toggling the counter off, drops back to the resting reveal / clean read.
  
## 6. Note actions (verbs)
Exactly **two verbs** on a note: **Reply** and **Resolve**.

- **Reply** appends a message to the note's thread (used to discuss or push back).
  
- **Resolve** is the reviewer's terminal accept-and-close (D34). For a suggested edit, Resolve = accept. There is deliberately no separate accept/reject control: declining is the agent's move, not the reviewer's.
  
- **No edit.** A note is immutable once created; iteration happens via replies in its thread, never by editing the note body.
  
## 7. Selecting text - the click "selection ladder"
Creation begins by selecting prose. The previewer implements a macOS-style escalating selection:

- **1 click** - place a caret (a point / potential insert position). Does NOT pop the creation bar (placing a caret while reading must not nag).
  
- **2 clicks on a word** - select the word.
  
- **2 clicks on a space** - select the gap between words (a point).
  
- **3 clicks** - select the sentence.
  
- **4 clicks** - select the paragraph.
  

Each selection (and the deliberate gap-select) surfaces the creation bar (section 8).

**Implementation note (important):** this is macOS _native text view_ behavior, not web-browser default. Browsers give only single=caret, double=word, triple=whole paragraph - no sentence level and no quadruple-click. The web view must therefore implement the ladder itself: detect the click count (available on the event), compute sentence/paragraph ranges (a sentence segmenter is available in modern browsers), and set the selection programmatically, behaving identically across Chrome, Safari, and Firefox. This is real, scoped work, not a free browser feature.
## 8. Creating a note (composition)
- On a selection, a **floating bar with a single "Comment" pill** appears near the selection. (Only one pill - this is not a rich formatting toolbar.) The keyboard shortcut is **Cmd+Option+M / Ctrl+Alt+M** (Google Docs parity).
  
- Clicking Comment (or the shortcut) opens a **draft note in the rail**: a focused "Write a comment..." input with **Add** and **Cancel**.
  
  - **Add:** the draft becomes a real note card; the selected text takes its resting highlight (its fence is written into the prose); the counter ticks up.
    
  - **Cancel:** the draft and selection clear; nothing is written.
    
- All reviewer-created notes are **comments** anchored to whatever was selected (point, word, sentence, or paragraph). Note _type_ follows intent expressed in words, which the agent reads; the reviewer does not pick `insert`/`delete`/`replace` at creation time. To suggest adding text, the reviewer comments on the nearest text ("add a line here about X") and the agent performs the insert.
  
## 9. Resolve flow
When the reviewer hits Resolve on a note:

- the note's fence/pillar is **stripped from the prose** (the agreed text simply remains as plain prose - D19),
  
- the card **leaves the rail**, and
  
- the counter **ticks down**.
  

The resolved record is still **preserved in the file's** `mw:archive` (protocol behavior, D19/D29 - effectively free). Only the **UI to browse resolved notes** is deferred (see Deferred).
## 10. Discard a note (deferred, with a decided direction)
Deferred for v0. The decided direction for when it is built:

- Affordance: an `(x)` on the note, click -> confirmation -> remove.
  
- A discarded note is **removed entirely** (it does NOT land in `mw:archive`). The archive is meaningful audit history ("what feedback this doc needed"); a discard is "I never meant to leave this," so routing it to the archive would pollute exactly that signal.
  
- Discard is limited to notes the **agent has not acted on yet**; once the agent has responded, retraction is out of scope.
  
## 11. "Done reviewing" handoff
There is **no document-level "Done" status**. "Done reviewing" is purely a convenience that packages the human -> agent handoff. v0 behavior:

- It **copies a ready-to-paste bundle to the clipboard**: the model-agnostic agent instruction block (the same content `markwise prompt` / AGENT_PROMPT.md emits, with the current time filled in) plus the current document (including its `mw:log`).
  
- A toast confirms ("Copied - paste into your agent to start the revision pass").
  
- The reviewer pastes it into any agent (Claude Code, Claude.ai, ChatGPT). Because the instruction block carries the full protocol, a brand-new agent can comply with zero prior integration (P1 / D20). It works whether or not the agent can see the reviewer's files (the doc is in the bundle).
  
- This upgrades later into a direct invocation / MCP path, but that is out of v0.
  
## 12. v0 state summary
| State | What the reviewer sees |
| --- | --- |
| Opening (clean read) | Just the document; counter is the only review trace |
| Notes revealed | Fences light up; rail of note cards appears |
| Note active | One card expanded (thread + reply + Reply/Resolve); its fence deep-shaded |
| Composing | Floating Comment pill -> draft card in rail (Add / Cancel) |
| After Resolve | Fence stripped, card gone, counter down; record kept in file's archive |
| Handoff | "Done reviewing" copies the agent bundle to the clipboard |
## 13. Implementation notes / ties to existing code
- **Reuse the lint core as a library** (D40). `parse` -> `lintText` / `fixText` are pure `string -> data`; the web view imports the same core to read/validate/repair `mw:` records rather than re-implementing parsing. Expose a library entry point (re-export `parse`, `lintText`, `fixText`, and the types) when this second consumer arrives.
  
- **Hashing in the browser** (D40). `src/hash.ts` uses `node:crypto`; a pure-browser web view needs a deliberate one-line swap to Web Crypto (`crypto.subtle.digest`).
  
- The previewer writes the **same records** an agent/author would (D21/D22): create = place fence + append a `mw:log` JSONL record + selector; reply = append a thread message; resolve = strip fence
  
  - move record to `mw:archive` + write the compact summary. `lint` remains the safety net.
    
## 14. Deferred (post-v0)
- Archive / resolved-notes **browse view** (the records are preserved in-file regardless).
  
- **Discard a note** (direction decided in section 10).
  
- **Touch-device interactions** (no multi-click; rely on native long-press selection feeding the same Comment bar). D1 requires this eventually.
  
- **Per-note-type color language** (the section 4 treatments are placeholders).
  
- **Who-spoke-last status indicators** on cards ("needs you" vs "with agent") and counter split.
  
- **Navigation + keyboard** beyond add-comment (next/prev note, jump-to).
  
- **Deeper agent integration** for handoff (direct invoke / MCP) beyond the clipboard bundle.
