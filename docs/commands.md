# Command reference

The complete reference for the Markwise CLI. For the short version, see the
[README](../README.md#the-toolkit).

## `markwise preview`

Open a document in the local web previewer.

```bash
markwise preview <file>
```

Prints a `localhost` URL and keeps running until you stop it. In the browser you can:

- read the document with all review state rendered in the margin;
- select any text (double-click, drag, or keyboard selection) and leave a **comment**;
- select text and **type** to propose a replacement, press Delete to propose a deletion, or
  click and type to propose an insertion - Google-Docs-style suggested edits, shown inline;
- **reply** in any thread and **resolve** or **discard** notes;
- switch between three themes (Dark, Light, Sepia).

Every action is saved into the markdown file immediately. The previewer serves one file per
process and binds to localhost only.

## `markwise lint`

Validate the Markwise records and anchors in a markdown file.

```bash
markwise lint <file...> [--fix] [--strict] [--json]
```

| Flag | Effect |
|------|--------|
| `--fix` | Repair **mechanical** anchor fields only (a stale `hash`, drifted `before`/`after` context). Never touches prose, dispositions, state, threads, or suggested-edit text. Always reports what it did, including when there is nothing to repair. |
| `--strict` | Treat warnings as failures (non-zero exit). |
| `--json` | Emit findings as JSON instead of text. |

### Severity and exit codes

Severity tracks **consequence**, not which check produced it:

- **error** - the file is unparseable, the review state is corrupted, or raw markup would leak
  into a normal markdown preview. The doc is broken or looks broken.
- **warning** - the file is valid and renders clean, but something is degraded or almost
  certainly a mistake (a stale hash, a declined note with no reply).

| Exit code | Meaning |
|-----------|---------|
| `0` | clean, or only warnings (without `--strict`) |
| `1` | one or more errors (or any warning with `--strict`) |
| `2` | usage error / file not found |

The full list of checks (24 rules across structural integrity, anchor health, and lifecycle
consistency) is in [`LINT_SPEC.md`](../LINT_SPEC.md). Each rule has a stable id
(`L101`-`L304`) referenced in output.

## `markwise status`

A human-facing summary of where a review stands. It counts open vs resolved notes and, using
the "who spoke last" rule, tells you whose turn each open note is on.

```bash
markwise status <file...> [--json]
```

- **Waiting on you** - the agent has responded; you resolve or push back. (Notes where the
  agent asked a question are also flagged as needing your answer.)
- **Waiting on the agent** - a brand-new note, or you replied on top of the agent's last action.

`status` is informational and always exits `0`.

## `markwise prompt`

Emits the model-agnostic instruction block for an agent (with the current timestamp filled
in), the list of notes currently waiting on the agent, then the document - a single bundle you
can hand to any model.

```bash
markwise prompt <file> [--author]
```

- default: the revise-and-respond block ([`AGENT_PROMPT.md`](../AGENT_PROMPT.md)).
- `--author`: the note-authoring block ([`AUTHOR_PROMPT.md`](../AUTHOR_PROMPT.md)), for
  turning plain feedback into notes.

## `markwise export` (alias `strip`)

Produces a clean, shareable copy with all Markwise data removed (the blocks and every inline
marker; the wrapped prose stays). Because `mw:` comments are invisible in normal preview, this
is the safe way to share a file without leaking hidden review feedback.

```bash
markwise export <file>                  # clean copy to stdout
markwise export <file> -o clean.md     # clean copy to a new file
```

It **never modifies the original** - the clean copy goes to stdout or `--output`.

## `markwise agent-setup` (alias `setup`)

Prints self-contained, agent-directed setup instructions. Paste the output (or just the
one-liner from the README) into Claude Code, Codex, or any coding agent: it has the agent add
a `## Markwise` section to its persistent instruction file (such as `~/.claude/CLAUDE.md` or
`~/.codex/AGENTS.md`) that teaches when to reach for Markwise and how to run the
preview -> act-on-feedback loop. The CLI never edits those files itself.

## Protocol documents

- [`DECISIONS.md`](../DECISIONS.md) - the decision log for the protocol.
- [`CONTEXT.md`](../CONTEXT.md) - the glossary.
- [`LINT_SPEC.md`](../LINT_SPEC.md) - the full rule catalog the linter checks against.
- [`AGENT_PROMPT.md`](../AGENT_PROMPT.md) / [`AUTHOR_PROMPT.md`](../AUTHOR_PROMPT.md) - the
  agent-facing instruction blocks.
