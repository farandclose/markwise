# Markwise previewer - "Hand to agent" handoff (design)
Date: 2026-06-05. Parent spec: `docs/superpowers/specs/2026-06-01-previewer-ui-design.md` (section 11), re-scoped here.
## 1. Context and goal
The previewer already lets a reviewer read, create, reply to, and resolve notes (M1, M2, M3a). What it lacks is an **exit**: once the reviewer is happy with a pass, there is no clean way to hand the document back to the agent so it can act on the open notes. This slice adds that exit - a top-right **"Hand to agent"** button that copies a short, ready-to-paste pickup ticket to the clipboard. It is a pure convenience: read-only, no file change.
## 2. Scope
**In this slice:** the button, the clipboard payload, success/error feedback, and the supporting `/api/doc` payload field.

**Deferred (sequenced after this slice):**

1. `markwise setup` - inject an ambient pointer into the agent's persistent instruction file (`~/.claude/CLAUDE.md` for Claude Code, `~/.codex/AGENTS.md` for Codex), RoughDraft-style, so agents are Markwise-aware in every session.
  
2. Discard a note (parent spec section 10).
  
3. Browse resolved/archived notes (parent spec section 14).
  

**Out (later, if ever):** inlining the full document into the bundle for agents that cannot read files (a no-filesystem chat fallback); a formal Claude `SKILL.md` (Claude-only, additive on top of the cross-agent instruction-file model).
## 3. Key decisions and why
- **D-a - Path-based, not document-inlined.** Markwise's primary workflow is a repo-resident agent (it wrote the file). A path is leaner, always reflects the live file (a pasted copy can go stale), and does not burn the agent's context. Inlining the document only helps a no-filesystem chat agent, which is secondary and deferred.
  
- **D-b - Reference the protocol, never restate it.** `markwise prompt <file>` is the single source of truth: it emits the canonical `AGENT_PROMPT.md` (which already covers turn-taking and the blast-radius rule, DECISIONS D25) plus the list of notes waiting on the agent. The bundle therefore carries **no behavioral instructions**. This is deliberate: any hand-written summary of "how to act" both duplicates the protocol and risks contradicting it (for example, "act on these, leave the rest untouched" directly contradicts D25's requirement to sweep a rewrite's blast radius).
  
- **D-c - Delegate to** `markwise prompt`**.** The clipboard tells the agent to run that command. This works **cold** (no prior setup needed) and gets even leaner once `markwise setup` plants the ambient pointer.
  
- **D-d - Label "Hand to agent," not "Done reviewing."** There is no document-level "done" status (parent spec section 11); the button changes nothing in the file. "Hand to agent" is honest about what happens: you are passing the baton, not closing the document.
  
## 4. The control
- **Placement:** previewer header, top-right, alongside the open-notes counter.
  
- **Label:** "Hand to agent".
  
- **State:** enabled when at least one note is waiting on the agent; dimmed with a tooltip ("No notes waiting on the agent") when the waiting count is 0. Handing off when nothing is the agent's turn is pointless, so the control reflects that.
  
## 5. The clipboard payload
Exact text, with the count phrase agreeing in number:

```
A Markwise review of `<path>` just finished. <count phrase>.

Run `markwise prompt <path>` to load the protocol and those notes, then act on them.
```

- `<path>`: the path `markwise preview` was launched with.
  
- `<count phrase>`: derived from `status(src).waitingOnAgent.length` - `1 note is waiting on you` for a count of 1, `<N> notes are waiting on you` for any other count.
  
- Example (count 3): A Markwise review of `playground.md` just finished. 3 notes are waiting on you.
  
- No em-dashes; avoid the sequences `--` and `-->` (HTML-comment safety, consistent with the protocol's own rule).
  
## 6. Data flow and server
- The `/api/doc` payload gains a `handoff` field: `{ path: string, waitingCount: number, text: string }`.
  
- It is built on every request from the launch path plus `status(src).waitingOnAgent`. Pure, read-only, no write path.
  
- A small pure helper `buildHandoffText({ path, waitingCount })` returns the string and is unit-testable in isolation.
  
- No new endpoint. Folding the handoff into the existing `/api/doc` lets the browser copy synchronously on click (see section 7). An alternative `GET /api/handoff` was considered and rejected because fetching at click time risks losing the user-gesture context that the clipboard API requires.
  
## 7. Browser
- Render the "Hand to agent" button in the header; bind its click handler once.
  
- On click: call `navigator.clipboard.writeText(payload.handoff.text)` **synchronously** inside the gesture (the text is already in hand from the last `load()`), then show the success toast.
  
- Disabled (dimmed, non-interactive) when `handoff.waitingCount === 0`.
  
- The `handoff` field arrives with every `load()` repaint, so the count and text stay correct after replies, resolves, and creates.
  
## 8. Error handling
- If `navigator.clipboard` is unavailable or blocked, show the existing error toast variant ("Couldn't copy - check clipboard permissions").
  
- No file mutation, so there is no lint gate and no 422 path here.
  
## 9. Testing
- **Unit (**`buildHandoffText`**):** singular vs plural count, path interpolation, the zero-waiting case.
  
- **Server (**`/api/doc`**):** the payload includes `handoff` with the correct path, `waitingCount`, and `text` for a document with notes waiting on the agent, and for one with none.
  
- **Browser:** a click copies the expected text and raises the success toast (manual / Playwright dogfood; a thin DOM-level test if practical).
  
## 10. Success criteria
A reviewer finishes a pass, clicks "Hand to agent," and pastes into Claude Code or Codex. The agent runs `markwise prompt <path>`, sees the canonical protocol and exactly the notes that are its turn, and acts on them - with zero re-pasted instructions and nothing in the bundle that can drift from or contradict the protocol.
