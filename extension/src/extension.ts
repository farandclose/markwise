import * as vscode from 'vscode';

// U2 scaffold: register the single command and open a placeholder panel so the activation +
// packaging path is exercised end to end. U3 replaces the panel body with the real previewer
// (engine-rendered document, notes rail, CSP/nonce, postMessage bridge).
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('markwise.openPreview', () => {
      const panel = vscode.window.createWebviewPanel(
        'markwise.preview',
        'Markwise',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );
      panel.webview.html =
        '<!doctype html><html><head><meta charset="utf-8" /></head>' +
        '<body><p>Markwise preview (scaffold) - rendering arrives in U3.</p></body></html>';
    })
  );
}

export function deactivate(): void {
  // no-op: all disposables are registered on context.subscriptions
}
