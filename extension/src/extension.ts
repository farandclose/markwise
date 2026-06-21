import * as vscode from 'vscode';
import { openPreview } from './panel';
import { makePersist } from './save';

// Activation registers the single command. It opens the Markwise previewer for the active markdown
// file in a panel beside the editor. Save (U4), file-watch refresh (U5), and handoff (U6) extend the
// panel via the `extras` it accepts.
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('markwise.openPreview', () => {
      const uri = activeMarkdownUri();
      if (!uri) {
        void vscode.window.showWarningMessage(
          'Markwise: open a Markdown file, then run "Markwise: Open Preview".'
        );
        return undefined;
      }
      // Returned so callers (and integration tests) can reach the panel.
      return openPreview(context, uri, { persist: makePersist(uri) });
    })
  );
}

function activeMarkdownUri(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const doc = editor.document;
  const isMarkdown = doc.languageId === 'markdown' || /\.(md|markdown)$/i.test(doc.uri.path);
  return isMarkdown ? doc.uri : undefined;
}

export function deactivate(): void {
  // no-op: all disposables are registered on context.subscriptions
}
