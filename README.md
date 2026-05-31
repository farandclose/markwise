# Markwise

A human-agent review layer for markdown. A reviewer leaves anchored, structured **notes** on an
agent-written markdown file; a fresh agent revises the doc and responds to every note. All review
state lives **in the file itself**, as HTML comments that stay invisible in normal markdown
previews.

- The **protocol** is documented in `DECISIONS.md` (the decision log) and `CONTEXT.md` (the
  glossary). `LINT_SPEC.md` is the full rule catalog the linter checks against.
- The agent-facing instruction blocks are `AGENT_PROMPT.md` (revise + respond) and
  `AUTHOR_PROMPT.md` (turn plain feedback into notes).

## Status

| Surface | State |
|---------|-------|
| Protocol + schema | locked, dry-run validated |
| `markwise lint` | **built** (this README) |
| `markwise status` / `prompt` / `export` | planned |
| Web previewer | planned (read-only view first) |

## Install / build

```bash
pnpm install
pnpm build      # compiles TypeScript to dist/
```

## `markwise lint`

Validate the Markwise records and anchors in a markdown file.

```bash
node dist/cli.js lint <file...> [--fix] [--strict] [--json]
```

| Flag | Effect |
|------|--------|
| `--fix` | Repair **mechanical** anchor fields only (a stale `hash`, drifted `before`/`after` context). Never touches prose, dispositions, state, threads, or suggested-edit text. Always reports what it did, including when there is nothing to repair. |
| `--strict` | Treat warnings as failures (non-zero exit). |
| `--json` | Emit findings as JSON instead of text. |

### Severity and exit codes

Severity tracks **consequence**, not which check produced it:

- **error** - the file is unparseable, the review state is corrupted, or raw markup would leak into
  a normal markdown preview. The doc is broken or looks broken.
- **warning** - the file is valid and renders clean, but something is degraded or almost certainly a
  mistake (a stale hash, a declined note with no reply).

| Exit code | Meaning |
|-----------|---------|
| `0` | clean, or only warnings (without `--strict`) |
| `1` | one or more errors (or any warning with `--strict`) |
| `2` | usage error / file not found |

### Example

```
$ node dist/cli.js lint sample.md
sample.md: clean

0 errors, 0 warnings
```

The full list of checks (24 rules across structural integrity, anchor health, and lifecycle
consistency) is in `LINT_SPEC.md`. Each rule has a stable id (`L101`-`L304`) referenced in output.

## Tests

```bash
pnpm test
```

The suite is fixture-driven: one broken-file fixture per rule, a frozen clean reference document, a
realistically-messy multi-error document, and `--fix` round-trip checks.
