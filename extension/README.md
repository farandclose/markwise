# Markwise for VS Code

Read and review agent-written markdown inside VS Code. The extension hosts the Markwise previewer in
an editor panel: a clean rendered document with an anchored notes rail, comment / reply / suggest /
resolve, the three reading themes, and a one-click handoff to a fresh agent - all without leaving the
editor.

This is a separate package in the [Markwise](https://github.com/farandclose/markwise) repo. It imports
the Markwise engine as a library and bundles it, so the review loop needs no separately installed
`markwise` CLI.

## Develop

```bash
npm install            # in this extension/ directory
npm run build          # builds the engine, copies webview assets, bundles the host
npm run test:unit      # pure-module tests (fast, headless)
```

Press `F5` in VS Code to launch the Extension Development Host, then run **Markwise: Open Preview**.

Integration tests (a downloaded VS Code instance) need a display:

```bash
npm run pretest:integration
npm run test:integration
```

## Configuration

- `markwise.handoff.agentCommand` (default `claude`) - the command **Hand to agent** runs in a new
  terminal. The extension passes it a prompt pointing at an in-process briefing (protocol + open
  notes + the document). Set it to `codex` or your own launcher, or leave it empty to always fall
  back to copying the briefing to the clipboard.

## Package & publish

The same `.vsix` is published to both registries (human-gated, like the npm release):

```bash
npm run smoke            # build + verify the .vsix ships only built output
npm run package:vsix     # -> markwise-vscode-X.Y.Z.vsix

# VS Code Marketplace (vsce; use Microsoft Entra auth - PAT auth retires Dec 1 2026)
npx vsce publish --packagePath markwise-vscode-X.Y.Z.vsix

# Open VSX (Cursor / VSCodium family)
npx ovsx publish markwise-vscode-X.Y.Z.vsix
```

The build bundles the engine and `markdown-it` into `dist/extension.js` (esbuild, `vscode` external),
so the shipped extension needs no separately installed `markwise` CLI. The browser previewer
(`markwise preview`) and the CLI are unaffected by this package.

