# Markwise - agent setup packaging (roadmap D)

Date: 2026-06-10. Related: DECISIONS D20 (model-agnostic prompts), the existing `AGENT_PROMPT.md` / `AUTHOR_PROMPT.md` template pattern, RoughDraft's `agent-setup` command (the user's precedent: the CLI prints setup text; the AGENT injects instruction blocks - the CLI never edits config files).

## 1. Context and goal

Markwise's agent-facing surface today is per-document: `markwise prompt <file>` emits instructions for acting on one doc's feedback. Nothing tells a coding agent that Markwise exists, when to reach for it, or how to wire it into its persistent instructions. Roadmap D closes that: a distribution/setup story so Markwise installs into Claude Code and Codex the way RoughDraft does.

Three product decisions confirmed 2026-06-10:

1. **Distribution (Option C):** install from GitHub for now (`npm i -g github:farandclose/markwise`), with the install line isolated in one place so an npm publish later is a one-line change. No npm publish, no hosted URLs in this slice.
2. **Triggers (Option C+A):** the injected block tells agents to use Markwise (a) when review feedback should persist in-file and drive an act-on-feedback loop, (b) when the user names it (`markwise` / `mw`), or (c) when a doc already carries `mw:` markers. Generic "review this markdown" requests are NOT claimed (no conflict with RoughDraft's block on machines that have both).
3. **Mechanism (Approach 1):** a self-contained `markwise agent-setup` CLI command that prints the full agent-directed setup instructions with the canonical instruction block embedded. No hosting; output is version-locked to the installed CLI. The CLI never edits instruction files itself.

## 2. Deliverables

1. **`SETUP_PROMPT.md`** (repo root, added to package.json `files`): the agent-directed setup document (section 3).
2. **CLI command `agent-setup`** (alias `setup`): prints a short paste-able header plus `SETUP_PROMPT.md` verbatim. Loaded with the same `new URL('../SETUP_PROMPT.md', import.meta.url)` pattern `promptCommand` uses. No arguments; `--help` documents it.
3. **README section** "Set up your coding agent": the one-liner to paste into a fresh agent.
4. **Tests**: vitest coverage following the existing CLI test pattern.

## 3. SETUP_PROMPT.md content (the review artifact - exact draft)

````markdown
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
npm i -g github:farandclose/markwise
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
2. Open it for the user: `markwise preview <file>` (prints a localhost URL; keep it running).
   The user reads in the browser and leaves comments, replies, and suggested
   insert/replace/delete edits. Everything they do is saved into the file.
3. When the user says they are done (or asks you to act on the feedback), run
   `markwise prompt <file>` and follow what it prints: act on each note that is waiting on
   you, reply in its thread, and never resolve notes yourself - resolving is the human's call.
4. Repeat until no notes are waiting.

Useful commands: `markwise status <file>` (what is waiting on whom), `markwise lint <file>`
(validate the review data; `--fix` repairs mechanical fields), `markwise export <file>` (a
clean copy with all review data stripped - never modifies the original).

Never hand-edit `<!-- mw:... -->` markers, the `mw:log` block, or note `state` fields except
as `markwise prompt` instructs.
```

## Confirm

Tell the user which file you updated and show them the added section.
````

## 4. CLI shape

- `markwise agent-setup` (and alias `setup`) ignores extra args, prints:
  - a two-line header: `To set up your coding agent, paste this into it:` plus the one-liner `Install Markwise for me with \`npm i -g github:farandclose/markwise\`, then run \`markwise agent-setup\` and follow what it prints.`
  - a separator, then `SETUP_PROMPT.md` verbatim.
- Exit 0; exit 2 with a stderr message if `SETUP_PROMPT.md` is missing from the package (mirrors `promptCommand`'s missing-template handling).
- Help text gains one usage line and the command description.

The GitHub install spec string (`github:farandclose/markwise`) appears in exactly two places in the codebase: the paste-able one-liner in `cli.ts` and the install step in `SETUP_PROMPT.md`. Flipping to npm later means editing those two lines.

## 5. Out of scope

- npm publish and hosted setup/prompt URLs (revisit when publishing).
- Agents beyond Claude Code and Codex in the documented locations (the block is plain markdown; other agents work unofficially).
- A command that edits CLAUDE.md/AGENTS.md directly (deliberately excluded, matching RoughDraft).
- Previewer changes; protocol changes. None.

## 6. Testing

vitest, following the existing CLI test conventions (the suite currently drives commands through the exported entry or a child process - match whatever `test/` does for `prompt`):

1. `agent-setup` exits 0 and stdout contains: the paste-able one-liner, the `## Markwise` canonical block heading, the GitHub install spec, `markwise preview <file>`, and `markwise prompt <file>`.
2. `setup` alias produces identical output.
3. Unknown-command handling is unchanged (regression).
4. `SETUP_PROMPT.md` is listed in package.json `files` (assert via reading package.json in a test, so a future refactor cannot silently drop it from the published package).

Manual verification: run `markwise agent-setup` from the built CLI; paste the output into a scratch agent session and confirm the steps are followable (the controller does this by inspection, not by actually editing this machine's CLAUDE.md - the user's real CLAUDE.md is not a test surface).
