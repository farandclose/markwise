# Agent Setup Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-contained `markwise agent-setup` command (alias `setup`) that prints the agent-directed setup instructions, so a coding agent can install Markwise and inject the canonical "## Markwise" block into its persistent instructions.

**Architecture:** Mirrors the existing prompt-template pattern exactly: a markdown template at the repo root (`SETUP_PROMPT.md`, shipped via package.json `files`), a pure builder (`src/setup.ts` `buildSetupOutput`, unit-tested like `src/prompt.ts`), and a thin CLI command in `src/cli.ts` that loads the template via `new URL('../SETUP_PROMPT.md', import.meta.url)` (same as `promptCommand`). The CLI never edits instruction files - it only prints. Spec: `docs/superpowers/specs/2026-06-10-agent-setup-design.md` (the SETUP_PROMPT.md content is FIXED in its section 3 - do not reword it).

**Tech Stack:** TypeScript (Node >= 20, ESM), vitest. No new dependencies.

---

### Task 1: `SETUP_PROMPT.md` + package.json `files` entry (TDD)

**Files:**
- Test: `test/setup.test.ts` (create - first half)
- Create: `SETUP_PROMPT.md` (repo root)
- Modify: `package.json` (the `files` array)

- [ ] **Step 1: Write the failing tests**

Create `test/setup.test.ts`:

```ts
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const setupPromptPath = fileURLToPath(new URL('../SETUP_PROMPT.md', import.meta.url));

test('SETUP_PROMPT.md carries the canonical block and the install spec', () => {
  const t = readFileSync(setupPromptPath, 'utf8');
  expect(t).toContain('# Markwise agent setup');
  expect(t).toContain('## Markwise'); // the canonical injected block heading
  expect(t).toContain('npm i -g github:farandclose/markwise'); // the single install spec (spec section 4)
  expect(t).toContain('markwise preview <file>');
  expect(t).toContain('markwise prompt <file>');
  expect(t).toContain('never resolve notes yourself');
  expect(t).toContain('$HOME/.claude/CLAUDE.md');
  expect(t).toContain('AGENTS.md');
});

test('SETUP_PROMPT.md ships in the npm package', () => {
  const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  expect(pkg.files).toContain('SETUP_PROMPT.md');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/setup.test.ts`
Expected: FAIL - cannot read `SETUP_PROMPT.md` (ENOENT) and `files` does not contain it.

- [ ] **Step 3: Create `SETUP_PROMPT.md`**

Exactly this content (it is the spec's section 3 draft, verbatim - the user approved this wording):

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

(The outer ```` fence above is plan formatting only - the file starts at `# Markwise agent setup` and ends after the "Tell the user..." line.)

- [ ] **Step 4: Add `SETUP_PROMPT.md` to package.json `files`**

The array currently reads:

```json
  "files": [
    "dist",
    "AGENT_PROMPT.md",
    "AUTHOR_PROMPT.md"
  ],
```

Change to:

```json
  "files": [
    "dist",
    "AGENT_PROMPT.md",
    "AUTHOR_PROMPT.md",
    "SETUP_PROMPT.md"
  ],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/setup.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add SETUP_PROMPT.md package.json test/setup.test.ts
git commit -m "feat(setup): SETUP_PROMPT.md - the agent-directed setup document

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `buildSetupOutput` builder (TDD)

**Files:**
- Test: `test/setup.test.ts` (append - second half)
- Create: `src/setup.ts`

- [ ] **Step 1: Append the failing tests**

Append to `test/setup.test.ts`:

```ts
import { buildSetupOutput } from '../src/setup.js';

test('buildSetupOutput prepends the paste-able header and keeps the template verbatim', () => {
  const out = buildSetupOutput({ template: 'TEMPLATE BODY' });
  expect(out).toContain('To set up your coding agent, paste this into it:');
  expect(out).toContain(
    'Install Markwise for me with `npm i -g github:farandclose/markwise`, then run `markwise agent-setup` and follow what it prints.'
  );
  expect(out).toContain('TEMPLATE BODY');
  // Header first, separator, then the template.
  expect(out.indexOf('To set up')).toBeLessThan(out.indexOf('---'));
  expect(out.indexOf('---')).toBeLessThan(out.indexOf('TEMPLATE BODY'));
});

test('buildSetupOutput over the real SETUP_PROMPT.md yields the full followable doc', () => {
  const template = readFileSync(setupPromptPath, 'utf8');
  const out = buildSetupOutput({ template });
  expect(out).toContain('# Markwise agent setup');
  expect(out).toContain('## Markwise');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/setup.test.ts`
Expected: FAIL - cannot resolve `../src/setup.js`.

- [ ] **Step 3: Create `src/setup.ts`**

```ts
// The `agent-setup` command's output: a short paste-able header (what a user drops into a fresh
// agent session) followed by SETUP_PROMPT.md verbatim (what an agent that already has the CLI
// follows). The CLI only PRINTS this - it never edits instruction files itself (spec: the agent
// does the injection, RoughDraft-style). The GitHub install spec below is one of exactly two
// occurrences in the codebase (the other is SETUP_PROMPT.md); an npm publish later edits both.

export interface SetupOutputInput {
  template: string; // SETUP_PROMPT.md content
}

const PASTE_HEADER =
  'To set up your coding agent, paste this into it:\n\n' +
  'Install Markwise for me with `npm i -g github:farandclose/markwise`, then run `markwise agent-setup` and follow what it prints.\n';

export function buildSetupOutput(input: SetupOutputInput): string {
  return PASTE_HEADER + '\n---\n\n' + input.template;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/setup.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test && npx tsc -p tsconfig.json --noEmit`
Expected: 167 passed (163 + 4); tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/setup.ts test/setup.test.ts
git commit -m "feat(setup): buildSetupOutput - paste-able header + setup doc

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: CLI wiring (`agent-setup`, alias `setup`)

`src/cli.ts` is process-level glue with no unit tests by project convention; the safety net is the suite (unchanged), tsc, and Task 4's run of the built CLI.

**Files:**
- Modify: `src/cli.ts` (import block ~line 7, `USAGE` ~line 12-36, command dispatch ~line 334-340, new command function next to `promptCommand` ~line 240)

- [ ] **Step 1: Import the builder**

After the line `import { buildPromptOutput } from './prompt.js';` add:

```ts
import { buildSetupOutput } from './setup.js';
```

- [ ] **Step 2: Document the command in USAGE**

In the `USAGE` string, after the line

```
  markwise export <file> [--output <path>]   (alias: strip)
```

insert:

```
  markwise agent-setup                       (alias: setup) print coding-agent setup instructions
```

- [ ] **Step 3: Add the command function**

Immediately after `promptCommand`'s closing brace, add:

```ts
function agentSetupCommand(): number {
  let template: string;
  try {
    template = readFileSync(new URL('../SETUP_PROMPT.md', import.meta.url), 'utf8');
  } catch {
    process.stderr.write('markwise: cannot find SETUP_PROMPT.md in the package\n');
    return 2;
  }
  process.stdout.write(buildSetupOutput({ template }) + '\n');
  return 0;
}
```

- [ ] **Step 4: Dispatch it**

In `main()`, after the `if (args.command === 'prompt')` block, add:

```ts
  if (args.command === 'agent-setup' || args.command === 'setup') {
    process.exit(agentSetupCommand());
  }
```

- [ ] **Step 5: Suite, typecheck, build, smoke-run**

Run: `npm test && npx tsc -p tsconfig.json --noEmit && npm run build && node dist/cli.js agent-setup | head -5 && node dist/cli.js setup | head -1`
Expected: 167 passed; tsc 0; build 0; output starts with `To set up your coding agent, paste this into it:` for both spellings.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): agent-setup command (alias setup) prints the setup doc

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: README section + final verification

**Files:**
- Modify: `README.md` (new section; place it after whatever section documents the CLI commands - read the README first and slot it where it reads naturally)

- [ ] **Step 1: Add the README section**

```markdown
## Set up your coding agent

Markwise is built to be driven by a coding agent (Claude Code, Codex). To wire it in, paste
this into your agent:

> Install Markwise for me with `npm i -g github:farandclose/markwise`, then run
> `markwise agent-setup` and follow what it prints.

The command prints agent-directed instructions: it has the agent add a `## Markwise` section to
its persistent instruction file (such as `~/.claude/CLAUDE.md` or `~/.codex/AGENTS.md`) that
teaches when to reach for Markwise and the preview -> act-on-feedback loop. The CLI never edits
those files itself.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npx tsc -p tsconfig.json --noEmit && npm run build && node dist/cli.js agent-setup | tail -3`
Expected: 167 passed; tsc 0; build 0; tail shows the closing "Confirm" guidance from SETUP_PROMPT.md.

- [ ] **Step 3: Controller inspection (not delegated)**

The controller reads the full `node dist/cli.js agent-setup` output once end-to-end and confirms it is followable: header -> install check -> file locations -> canonical block -> confirm step, with no truncation and correct code fences.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): set up your coding agent section

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
