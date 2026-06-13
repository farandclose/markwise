# Ship Markwise to npm with cross-OS confidence

Date: 2026-06-13
Branch: `fix-issues`
Status: approved design, pending implementation plan

## Context

Markwise is a CLI (`bin: markwise -> dist/cli.js`) plus a local web previewer. The README tells
new users to install with `npm i -g github:farandclose/markwise`. That command fails for everyone:
the package's `prepare` script runs `tsc` during npm's git-dependency build, where `tsc` is not
resolvable (`sh: tsc: command not found`), so no binary is produced. This was reproduced on a clean
environment (npm 10.9.8, default config), not just inside a sandbox.

The goal is a reliable, low-friction install across macOS, Windows, and Linux, with confidence that
other people can install and run it. The npm registry is the channel that delivers this: it requires
no `git` on the user's machine and runs no compilation on the user's machine.

## Goal and success criteria

1. `npm i -g markwise` installs a working CLI on macOS, Windows, and Linux, with zero compilation on
   the user's machine.
2. CI proves the packaged artifact builds, tests, and runs on all three OSes on every commit.
3. Releases publish to npm automatically from a version tag.

## Scope

In scope:
- Publish-readiness of the npm package (metadata, verified tarball contents).
- Cross-platform verification of the runtime code (and fixes only if CI surfaces a real issue).
- A GitHub Actions CI matrix across Ubuntu, macOS, Windows.
- Publish-on-tag release automation.
- Rewriting the README install instructions to `npm i -g markwise`.

Out of scope:
- Fixing the GitHub `npm i -g github:...` install path. That is a later branch ("C"); the present
  branch deliberately leaves it failing loudly.
- Any change to the review/preview feature behavior.
- The landing site.

## Locked decisions

- Channel: npm registry, unscoped package name `markwise` (confirmed available, registry returns 404).
- `prepare` lifecycle is unchanged. It builds correctly at publish time (the publisher's machine has
  devDependencies) and registry consumers never run it. Keeping it also means the GitHub path keeps
  failing loudly in the interim rather than installing a silently broken binary.
- `dist/` stays gitignored. The published tarball ships `dist` via the `files` field.
- CI publish auth uses an `NPM_TOKEN` GitHub Actions secret. OIDC trusted publishing / provenance is
  a possible future upgrade, not part of this branch.
- Playwright e2e runs on Ubuntu only. The lightweight install-smoke test runs on all three OSes.
- The actual `npm publish` is run by the user (it needs `npm login`); this branch prepares everything
  up to that point and documents the exact commands.

## Design

### 1. Packaging and publish-readiness

- Add package.json metadata: `repository` (git+https://github.com/farandclose/markwise.git),
  `homepage`, `bugs`, `keywords` (for example: markdown, review, cli, annotations, agents, comments),
  and `author`. `license` (MIT) and `engines` (node >= 20) already exist.
- Verify the packed artifact with `npm pack --dry-run`. The tarball must contain:
  `dist/cli.js`, the rest of `dist/**` including `dist/preview/assets/**`, plus `AGENT_PROMPT.md`,
  `AUTHOR_PROMPT.md`, `SETUP_PROMPT.md`, `README`, and `LICENSE`. Adjust the `files` field only if
  something required is missing.
- Note: the install-smoke step runs `markwise lint sample.md`. `sample.md` is read from the working
  directory (the repo checkout in CI), so it does not need to be in the published tarball.
- README: rewrite the install section to `npm i -g markwise`, and keep a short "build from source"
  note for contributors.

### 2. Cross-platform code verification

- The preview server serves static assets via `readFile(new URL(name, ASSET_DIR))`, passing URL
  objects directly to `fs`. Node converts `file:` URLs to platform paths internally, so this is
  already Windows-safe. The build's `copy-preview-assets.mjs` uses `fileURLToPath` correctly.
- Therefore no code change is anticipated. This step is a verification, and the Windows CI install-
  smoke job is the proof. If CI surfaces a real path or runtime issue on Windows, fix it and add a
  focused test (test first).
- Quick scan for other POSIX-only assumptions (manual string path joins, `__dirname`, shelling out).

### 3. CI matrix (.github/workflows/ci.yml)

- Triggers: `push` and `pull_request`.
- Test matrix: os = [ubuntu-latest, macos-latest, windows-latest], node = [20, 22].
- Per job: checkout; setup-node with npm cache; `npm ci`; `npm run build`; `npm test` (vitest); then
  the install-smoke step.
- Install-smoke is a cross-platform Node script (`scripts/smoke.mjs`) rather than shell, to avoid
  bash-vs-pwsh differences on Windows. It: runs `npm pack`, installs the resulting tarball globally,
  invokes the installed `markwise lint sample.md` and asserts a clean result, then spawns
  `markwise preview sample.md`, asserts it prints a `http://127.0.0.1:` URL, and kills it. Non-zero
  exit on any failure.
- Playwright e2e: a separate job, ubuntu-latest only, node 22, with
  `npx playwright install --with-deps chromium`, then `npm run test:e2e`.

### 4. Release automation (.github/workflows/release.yml)

- Trigger: pushing a tag matching `v*`.
- Steps: checkout; setup-node with `registry-url` set; `npm ci`; `npm run build`; `npm test`;
  `npm publish` with `NODE_AUTH_TOKEN` sourced from `secrets.NPM_TOKEN`.
- Optional guard: verify the tag version matches package.json `version` before publishing.
- One-time manual setup (documented for the user): create an npm automation token, add it to the
  GitHub repo as a secret named `NPM_TOKEN`.
- Release flow becomes: bump `version` in package.json, commit, `git tag vX.Y.Z`, push the tag.

### 5. Verification and definition of done

- Local: `npm pack --dry-run` shows correct contents; `npm run build && npm test` is green; a
  clean-room global install from the packed tarball runs the previewer (via `node scripts/smoke.mjs`).
- CI: green across all three OSes (and the Ubuntu e2e job).
- Then the user publishes (`npm login`, bump version, `npm publish` or push a `v*` tag), and we re-run
  the clean-room test against the live `npm i -g markwise`.

## Manual steps owned by the user

- Create an npm account and run `npm login`.
- Create an npm automation token and add it as the GitHub secret `NPM_TOKEN`.
- Run the first publish, or push the first `v*` tag to let CI publish.

## Risks and assumptions

- The published tarball must contain runnable JavaScript plus the preview assets. Mitigated by pack
  inspection and the install-smoke job.
- Playwright cross-OS flakiness is avoided by running e2e on Ubuntu only.
- The npm name `markwise` is available now and should be claimed promptly.
- Assumes the GitHub repository is `farandclose/markwise` and the user has admin rights to add the
  secret and workflows.

## Testing strategy

- Any cross-platform code fix (only if CI reveals one) is written test-first.
- `scripts/smoke.mjs` is the cross-OS integration test, run in CI on all three OSes.
- Existing vitest and Playwright suites continue to run.
