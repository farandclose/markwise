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
