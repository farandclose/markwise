# Releasing Markwise

Markwise is published to npm. Users install with `npm i -g markwise`.

Releases publish automatically from a `v*` tag via GitHub Actions using **Trusted Publishing**
(OIDC) - GitHub mints a short-lived token that npm verifies against a trusted publisher you
configure on the package. No long-lived `NPM_TOKEN` secret is stored, and a provenance
attestation is attached automatically (the repo is public).

## One-time setup (Trusted Publishing)

The package already exists on npm (first version was published manually - see below). To let CI
publish future versions:

1. On npmjs.com, open the `markwise` package -> **Settings** -> **Trusted Publishing** -> add a
   trusted publisher:
   - **Organization or user:** `farandclose`
   - **Repository:** `markwise`
   - **Workflow filename:** `release.yml`
   - **Environment:** (leave blank)
   - **Allowed actions:** `npm publish`

That is the only setup. The workflow (`.github/workflows/release.yml`) already requests the
`id-token: write` permission and upgrades npm to a version that supports OIDC (>= 11.5.1).

## Cutting a release

1. Make sure CI is green on `main`.
2. Bump the version: edit `version` in `package.json` (e.g. `0.1.0` -> `0.1.1`).
3. Commit and tag:
   ```bash
   git commit -am "release: vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```
4. The Release workflow checks the tag matches `package.json`, builds, tests, and runs
   `npm publish` (authenticated via OIDC). Confirm the new version on
   https://www.npmjs.com/package/markwise.

## First publish (manual)

The first publish is done by hand (Trusted Publishing configures against an existing package):
```bash
npm login
pnpm run build
npm publish --access public   # enter your 2FA one-time code when prompted
```
