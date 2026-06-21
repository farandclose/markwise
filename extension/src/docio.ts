import * as vscode from 'vscode';
import { readDocument, toLf } from 'markwise';

// Reading the document source for rendering and for the save version-check. Prefer the open editor
// buffer (normalized to LF) so the rendered preview - and the version minted from it - matches what a
// save will write against, which is what keeps an unsaved editor buffer from triggering a spurious
// conflict on the first note (KTD3). Fall back to a fresh disk read when the file is not open.

function openDocFor(uri: vscode.Uri): vscode.TextDocument | undefined {
  const target = uri.toString();
  return vscode.workspace.textDocuments.find((d) => d.uri.toString() === target);
}

/** The document's current source, normalized to LF: the open buffer if any, else a fresh disk read. */
export function readSourceLf(uri: vscode.Uri): string {
  const open = openDocFor(uri);
  if (open) return toLf(open.getText());
  return readDocument(uri.fsPath).source;
}
