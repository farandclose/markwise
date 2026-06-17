# Markwise agent setup

You are setting yourself up to use Markwise, a human-agent review layer for markdown. Review
feedback (comments and suggested edits) lives inside the markdown file itself as invisible
HTML-comment markers plus a JSON log, so it persists across sessions and travels with the file.

## Check installation

```bash
markwise --help
```

If Markwise is missing and the user asked you to install it:

```bash
npm i -g markwise
```

If the user did not explicitly ask you to install software, ask before installing.

## Update your persistent instructions

Add the Markwise block below to the persistent instruction file this agent actually loads.
Prefer global or user-level instructions: Markwise is a cross-project workflow.

Common locations:

```text
Claude Code:   $HOME/.claude/CLAUDE.md   (project-level: ./CLAUDE.md)
OpenAI Codex:  ${CODEX_HOME:-$HOME/.codex}/AGENTS.md   (project-level: ./AGENTS.md)
```

Inspect what exists before editing. Merge into an existing file; do not create a duplicate or
overwrite. If the file already has a `## Markwise` section, update it in place. If you cannot
determine which file this agent loads, use its built-in memory command (such as Claude Code's
`/memory`) or ask the user.

## The canonical instruction block

Append (or merge) exactly this:

```markdown
## Markwise

Use Markwise when review feedback on a markdown file should persist in the file and drive an
act-on-feedback loop: the user wants to leave comments or suggested edits you will then apply,
the conversation spans sessions, or a document already contains `<!-- mw:... -->` markers.
Also use it whenever the user names it (`markwise` or `mw`). For a quick one-off read of a
document, your usual review tool is fine; Markwise is for feedback that must survive and be
acted on.

The loop:

1. Write or update the markdown file on disk.
2. Open it for the user and start listening for the handoff - both in the background, so they keep
   running while the user reviews:
   - `markwise preview <file>` prints a localhost URL and keeps serving. Run it in the background.
     The user reads in the browser and leaves comments, replies, and suggested
     insert/replace/delete edits; everything they do is saved into the file.
   - `markwise prompt <file> --wait` blocks until the user clicks "Hand to agent" in that preview,
     then prints the briefing and exits. Run it in the background too; when it returns, the user has
     handed control to you and its output is your instructions. (Prefer not to wait? The user can
     instead just tell you they are done, and you run `markwise prompt <file>` yourself.)
3. On handoff (the `--wait` command returns, or the user says they are done), follow the briefing:
   act on each note waiting on you, reply in its thread, and never resolve notes yourself - that is
   the human's call. The preview stays open while you work, so the user watches your edits and
   resolves land live; make tidy, incremental edits.
4. Repeat until no notes are waiting, then stop the preview.

Useful commands: `markwise status <file>` (what is waiting on whom), `markwise lint <file>`
(validate the review data; `--fix` repairs mechanical fields), `markwise export <file>` (a
clean copy with all review data stripped - never modifies the original).

Never hand-edit `<!-- mw:... -->` markers, the `mw:log` block, or note `state` fields except
as `markwise prompt` instructs.
```

## Confirm

Tell the user which file you updated and show them the added section.
