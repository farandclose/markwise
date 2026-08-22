# Markwise - Agent Instructions

## Agent skills

### Issue tracker

Issues live as GitHub issues on `farandclose/markwise`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root, with decisions recorded in `DECISIONS.md`. See `docs/agents/domain.md`.

## Cursor Cloud specific instructions

This is a pnpm/TypeScript monorepo with two packages: the root `markwise` CLI + engine + browser previewer (`src/`), and the VS Code extension in `extension/`. Each has its own `pnpm-lock.yaml` and must be installed separately (there is no pnpm workspace). The startup update script already runs both `pnpm install`s and `pnpm exec playwright install chromium`, so dependencies and the e2e browser are present on boot.

- There is no dev server / watch build for the CLI: development is compile-then-run. After editing `src/`, run `pnpm run build` (root) before running the CLI as `node ./dist/cli.js <command>`. The published `markwise` bin points at `dist/cli.js`, so nothing works until `dist/` is built.
- Standard commands (see `package.json`): `pnpm run build`, `pnpm test` (vitest, ~254 unit/integration tests), `pnpm run smoke` (packs a tarball and installs into a throwaway prefix), `pnpm run test:e2e` (builds, then Playwright chromium against the previewer). There is no ESLint config; type-checking is done by `tsc` as part of `pnpm run build` (that is the "lint" gate). `pnpm run lint:self` just runs the CLI's own `markwise lint sample.md`.
- The previewer (`node ./dist/cli.js preview <file.md>`) binds to `127.0.0.1` on an **ephemeral port** (printed on startup) and serves **one file per process** for a single reviewer. It mutates the target `.md` file in place (review state is stored as HTML comments in the file), so preview a scratch copy if you don't want to modify a tracked file. Verify persisted notes out-of-band with `node ./dist/cli.js status <file.md>`.
- The extension (`extension/`) builds via esbuild and depends on the root engine — its `build:engine` script runs the root build first. `pnpm -C extension run test:unit` runs its vitest suite. `pnpm -C extension run test:integration` downloads a full VS Code build via `@vscode/test-electron` and needs a display; treat it as optional/heavy in this environment.
