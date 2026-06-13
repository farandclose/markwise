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
