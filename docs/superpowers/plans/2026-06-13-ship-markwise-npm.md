# Ship Markwise to npm with cross-OS confidence - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm i -g markwise` install a working CLI on macOS, Windows, and Linux with no compilation on the user's machine, proven by a cross-OS CI matrix, and auto-published from a version tag.

**Architecture:** The npm package already publishes correctly (the `prepare` build runs on the publisher's machine where devDeps exist; registry consumers never build). So this is mostly packaging hygiene, a cross-platform install-smoke test, and CI. The one true code change is flipping the documented install string from the broken `github:` form to `markwise`, which is pinned by existing tests (so it is test-driven).

**Tech Stack:** Node >= 20, TypeScript (tsc build), pnpm 10.29.3 (dev/build/CI toolchain, lockfile v9), vitest (unit), Playwright (e2e), GitHub Actions (CI + release), npm registry (distribution).

---

## CRITICAL WORKSPACE NOTE

All work happens in the worktree **`/Users/saurabhmehta/Documents/imagineandbuild/markwise-fix-issues`** on branch **`fix-issues`**. The main folder (`.../markwise`) is a separate worktree on `feat/site-how-it-works` used by another terminal - do NOT touch it. Worktrees do not share `node_modules`, so this worktree needs its own `pnpm install` first. Paths below are relative to the worktree root.

## What this plan does NOT touch

- The `github:farandclose/markwise` string inside `docs/superpowers/**` (those are historical spec/plan records - leave them).
- The GitHub-install path itself (deferred to a later branch "C"). After this branch, `npm i -g github:...` still fails loudly; that is acceptable.
- Any review/preview feature behavior.

## File map

- `package.json` - add metadata + `packageManager` field + a `smoke` script (modify).
- `src/setup.ts` - flip the install one-liner constant to `markwise` (modify).
- `SETUP_PROMPT.md` - flip the install command to `markwise` (modify).
- `README.md` - flip the two install references to `markwise` (modify).
- `test/setup.test.ts` - update the two assertions that pin the old string (modify, test-first).
- `scripts/smoke.mjs` - new cross-platform install-smoke harness (create).
- `.github/workflows/ci.yml` - new CI matrix (create).
- `.github/workflows/release.yml` - new publish-on-tag workflow (create).
- `RELEASING.md` - new doc of the manual publish steps you own (create).

---

### Task 0: Workspace bootstrap and baseline

**Files:** none changed (setup only).

- [ ] **Step 1: Confirm location and branch**

Run: `cd /Users/saurabhmehta/Documents/imagineandbuild/markwise-fix-issues && git rev-parse --abbrev-ref HEAD`
Expected: `fix-issues`

- [ ] **Step 2: Install dependencies in this worktree**

Run: `pnpm install`
Expected: completes; `node_modules/` now exists. (This also runs `prepare` -> builds `dist/`.)

- [ ] **Step 3: Build and confirm a clean baseline**

Run: `pnpm run build && pnpm test`
Expected: build succeeds; vitest run reports all tests passing. This is the green baseline; do not proceed if red.

(No commit - nothing changed.)

---

### Task 1: package.json metadata and packageManager

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add metadata and the packageManager field**

Edit `package.json` to add these keys (place after `"description"` / near the top-level keys; keep valid JSON):

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/farandclose/markwise.git"
},
"homepage": "https://github.com/farandclose/markwise#readme",
"bugs": {
  "url": "https://github.com/farandclose/markwise/issues"
},
"keywords": ["markdown", "review", "annotations", "comments", "cli", "agents", "previewer"],
"author": "farandclose",
"packageManager": "pnpm@10.29.3"
```

- [ ] **Step 2: Verify the JSON parses and fields are set**

Run: `node -e "const p=require('./package.json'); console.log(p.repository.url, p.bugs.url, p.homepage, p.packageManager, p.keywords.join(','))"`
Expected: prints the git url, issues url, homepage, `pnpm@10.29.3`, and the keyword list with no error.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(pkg): add npm metadata and packageManager for publishing"
```

---

### Task 2: Verify the published artifact contents

**Files:**
- Modify (only if a required file is missing): `package.json` (`files`)

- [ ] **Step 1: Build, then inspect the tarball contents**

Run: `pnpm run build && npm pack --dry-run`
Expected: the printed `Tarball Contents` list includes ALL of:
- `package.json`
- `README.md`
- `LICENSE`
- `dist/cli.js`
- `dist/preview/assets/` files (e.g. `dist/preview/assets/index.html`, `.css`, `.js`)
- `AGENT_PROMPT.md`, `AUTHOR_PROMPT.md`, `SETUP_PROMPT.md`

Note: `sample.md` is intentionally NOT in the tarball - the smoke test reads it from the repo checkout, and consumers do not need it.

- [ ] **Step 2: If `dist/preview/assets/` is missing from the list**

That means the build's asset-copy step did not run before pack. Confirm `scripts/copy-preview-assets.mjs` runs as part of `build` and that `dist/preview/assets/` exists on disk (`ls dist/preview/assets`). The `files` field already includes `dist`, so assets present on disk will be packed. Only edit `files` if a genuinely required path is excluded.

- [ ] **Step 3: Commit (only if `files` changed)**

```bash
git add package.json
git commit -m "chore(pkg): ensure preview assets are included in the published tarball"
```

If nothing changed, skip the commit.

---

### Task 3: Flip the documented install string to `npm i -g markwise` (test-first)

The string `npm i -g github:farandclose/markwise` is pinned by two assertions in `test/setup.test.ts`. Change the tests first (they will fail against the old source), then change the source.

**Files:**
- Modify: `test/setup.test.ts`
- Modify: `src/setup.ts`
- Modify: `SETUP_PROMPT.md`
- Modify: `README.md`

- [ ] **Step 1: Update the failing tests first**

In `test/setup.test.ts`, change the two assertions:

From:
```ts
  expect(t).toContain('npm i -g github:farandclose/markwise'); // the single install spec (spec section 4)
```
To:
```ts
  expect(t).toContain('npm i -g markwise'); // the single install spec (spec section 4)
```

And from:
```ts
  expect(out).toContain(
    'Install Markwise for me with `npm i -g github:farandclose/markwise`, then run `markwise agent-setup` and follow what it prints.'
  );
```
To:
```ts
  expect(out).toContain(
    'Install Markwise for me with `npm i -g markwise`, then run `markwise agent-setup` and follow what it prints.'
  );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- test/setup.test.ts`
Expected: FAIL - the two assertions do not match because `src/setup.ts` and `SETUP_PROMPT.md` still contain the `github:` string.

- [ ] **Step 3: Update the source - `src/setup.ts`**

Change line 15's constant from:
```ts
  'Install Markwise for me with `npm i -g github:farandclose/markwise`, then run `markwise agent-setup` and follow what it prints.\n';
```
To:
```ts
  'Install Markwise for me with `npm i -g markwise`, then run `markwise agent-setup` and follow what it prints.\n';
```

- [ ] **Step 4: Update the source - `SETUP_PROMPT.md`**

Change the install command (currently `npm i -g github:farandclose/markwise`) to:
```
npm i -g markwise
```

- [ ] **Step 5: Rebuild and run the tests to verify they pass**

Run: `pnpm run build && pnpm test -- test/setup.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the docs - `README.md`**

Change both install references (the agent one-liner around line 67 and the "install it yourself" block around line 74) from `npm i -g github:farandclose/markwise` to `npm i -g markwise`. Optionally add one line under the install block: "Contributors: build from source with `pnpm install && pnpm run build`."

- [ ] **Step 7: Verify no stray old string remains in shipped/docs surfaces**

Run: `grep -rn "github:farandclose/markwise" src SETUP_PROMPT.md README.md test`
Expected: no matches (all occurrences in `docs/superpowers/**` are historical and intentionally left).

- [ ] **Step 8: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/setup.ts SETUP_PROMPT.md README.md test/setup.test.ts
git commit -m "feat(pkg): install via npm registry (npm i -g markwise)"
```

---

### Task 4: Cross-platform install-smoke harness

A Node script (not shell) so it runs identically on Windows, macOS, and Linux. It packs the package, installs the tarball into a throwaway prefix (NOT the real global, so it is safe to run locally), and verifies the installed CLI lints `sample.md` cleanly and prints a preview URL.

**Files:**
- Create: `scripts/smoke.mjs`
- Modify: `package.json` (add `smoke` script)

- [ ] **Step 1: Create `scripts/smoke.mjs`**

```js
// Cross-platform install smoke test. Packs the package, installs the tarball into a throwaway
// prefix (NOT the real global), then verifies the installed CLI runs. Exits non-zero on failure.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const work = mkdtempSync(join(tmpdir(), 'markwise-smoke-'));
const prefix = join(work, 'prefix');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', shell: isWin, ...opts });
}

let failure = null;
try {
  // 1. pack (runs prepare -> builds dist) into the work dir
  const packOut = run(npm, ['pack', '--pack-destination', work], { cwd: root });
  const tarball = join(work, packOut.trim().split('\n').pop().trim());
  if (!existsSync(tarball)) throw new Error(`pack produced no tarball:\n${packOut}`);

  // 2. install the tarball into a throwaway prefix (does not touch the real global)
  run(npm, ['install', '-g', '--prefix', prefix, tarball], { cwd: root });

  // 3. resolve the installed binary (posix: <prefix>/bin/markwise; win: <prefix>/markwise.cmd)
  const bin = isWin ? join(prefix, 'markwise.cmd') : join(prefix, 'bin', 'markwise');
  if (!existsSync(bin)) {
    throw new Error(`installed binary missing at ${bin}; prefix contents: ${readdirSync(prefix).join(', ')}`);
  }

  // 4. lint sample.md -> expect a clean result
  const lintOut = run(bin, ['lint', 'sample.md'], { cwd: root });
  if (!/clean/i.test(lintOut)) throw new Error(`lint did not report clean:\n${lintOut}`);
  console.log('[smoke] lint sample.md: clean');

  // 5. preview sample.md in the background -> expect a loopback URL, then kill it
  await new Promise((resolve, reject) => {
    const child = spawn(bin, ['preview', 'sample.md'], { cwd: root, shell: isWin });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`no URL in 10s:\n${out}`)); }, 10000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      const m = out.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) { clearTimeout(timer); child.kill(); console.log('[smoke] preview sample.md: ' + m[0]); resolve(); }
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });

  console.log('[smoke] PASS');
} catch (e) {
  failure = e;
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failure) { console.error('[smoke] FAIL: ' + failure.message); process.exit(1); }
```

- [ ] **Step 2: Add the `smoke` script to `package.json`**

In `"scripts"`, add:
```json
"smoke": "node scripts/smoke.mjs"
```

- [ ] **Step 3: Run the smoke test locally**

Run: `pnpm run build && pnpm run smoke`
Expected: prints `[smoke] lint sample.md: clean`, `[smoke] preview sample.md: http://127.0.0.1:<port>`, then `[smoke] PASS`, exit 0. It must NOT install into your real global (verify afterward with `which markwise` -> not found).

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.mjs package.json
git commit -m "test(pkg): cross-platform install-smoke harness"
```

Note: this is the v1 smoke harness. If the Windows CI job (Task 5) surfaces a `.cmd` invocation or prefix-path quirk, fix it here and re-commit; CI is the cross-OS proof.

---

### Task 5: CI matrix workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  test:
    name: test (${{ matrix.os }}, node ${{ matrix.node }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm test
      - run: pnpm run smoke

  e2e:
    name: e2e (ubuntu)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm run test:e2e
```

Note: `pnpm/action-setup@v4` reads the pnpm version from the `packageManager` field added in Task 1.

- [ ] **Step 2: Validate the YAML locally**

Run: `node -e "require('node:fs').readFileSync('.github/workflows/ci.yml','utf8'); console.log('file present')"` and visually re-read it for indentation.
Expected: no error. (True verification is the first push - see Step 4.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build, test, and install-smoke across Ubuntu/macOS/Windows"
```

- [ ] **Step 4: Push the branch and confirm CI is green**

```bash
git push -u origin fix-issues
```
Then open the Actions tab on GitHub and confirm every `test (...)` job and the `e2e` job pass. If Windows fails on the smoke step, fix `scripts/smoke.mjs` (Task 4) and push again. **This green matrix is the core "works on every OS" proof.**

---

### Task 6: Publish-on-tag release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm test
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Note: `npm publish` (not `pnpm publish`) is used so `NODE_AUTH_TOKEN` from `setup-node` authenticates cleanly. The `prepare` script rebuilds `dist` during publish; `files` ships it.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish to npm on version tag"
```

(Real verification of this workflow happens at first tag push - documented in Task 7 / RELEASING.md, and is owned by you.)

---

### Task 7: Release documentation and final local gate

**Files:**
- Create: `RELEASING.md`

- [ ] **Step 1: Create `RELEASING.md`**

```markdown
# Releasing Markwise

Markwise is published to npm. Users install with `npm i -g markwise`.

## One-time setup

1. Create an npm account and run `npm login`.
2. Create an npm **automation** access token (npmjs.com -> Access Tokens -> Generate -> Automation).
3. In GitHub: repo Settings -> Secrets and variables -> Actions -> New repository secret named `NPM_TOKEN`, value = the automation token.

## Cutting a release

1. Make sure CI is green on the branch.
2. Bump the version: edit `version` in `package.json` (e.g. `0.1.0` -> `0.1.1`).
3. Commit and tag:
   ```bash
   git commit -am "release: vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```
4. The Release workflow builds, tests, and runs `npm publish`. Confirm the new version on https://www.npmjs.com/package/markwise.

## First publish (manual alternative)

If you prefer to publish the first version by hand:
```bash
npm login
pnpm run build
npm publish --access public
```
```

- [ ] **Step 2: Run the full local verification gate**

Run each and confirm:
```bash
pnpm run build && pnpm test        # green
npm pack --dry-run                 # contents correct (Task 2 list)
pnpm run smoke                     # [smoke] PASS, real global untouched
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add RELEASING.md
git commit -m "docs: releasing guide (npm publish + tag flow)"
```

---

### Task 8: Publish and live-verify (owned by you, not the agent)

This is your action - it needs `npm login` credentials the agent does not have.

- [ ] **Step 1:** `npm login`.
- [ ] **Step 2:** Add the `NPM_TOKEN` GitHub secret (per RELEASING.md), if using tag-based release.
- [ ] **Step 3:** First publish - either push a `v0.1.0` tag (CI publishes) or run `npm publish --access public` locally.
- [ ] **Step 4:** Clean-room live verify: on a machine with a normal Node install, run `npm i -g markwise` and `markwise preview <somefile.md>`; confirm it prints a localhost URL. (We can re-run the same clean-room test we did earlier, against the live package this time.)

---

## Acceptance criteria (definition of done for the branch)

- `pnpm run build && pnpm test` green locally and in CI on Ubuntu/macOS/Windows (Node 20 and 22).
- `pnpm run smoke` passes on all three OSes in CI (install-from-tarball runs `lint` and `preview`).
- `npm pack --dry-run` shows a tarball containing `dist/**` (incl. preview assets) and the prompt files.
- No `github:farandclose/markwise` remains in `src`, `SETUP_PROMPT.md`, `README.md`, or `test`.
- Release workflow exists and is wired to `NPM_TOKEN`.
- After your publish: `npm i -g markwise` works in a clean-room test.
