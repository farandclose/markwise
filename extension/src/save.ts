import * as vscode from 'vscode';
import {
  persistDocument,
  readDocument,
  writeDocument,
  toLf,
  applyEol,
  shortHash,
  NoteMutationError,
} from 'markwise';
import type { DocPayload } from 'markwise';

// The save bridge (KTD3, R3/R6): turns the request handler's transport-agnostic persist into one
// that uses VS Code's own file model.
//
//  - File open in an editor: the version precondition is checked against the *editor buffer*
//    (normalized to LF, so it matches the hash the rendered payload was minted from), and the write
//    goes through a WorkspaceEdit + applyEdit + save so the buffer, dirty state, and undo stay
//    coherent. EOL is taken from the TextDocument, not re-detected (VS Code owns it on this path).
//  - File not open: the disk read/write path, byte-for-byte the same one the localhost server uses.
//
// Either way the shared persistDocument enforces the version-gate / fix / lint / never-persist-invalid
// guarantees, so the two transports cannot drift. Concurrency is handled by reading the version from
// the same surface that is written, plus a disk-divergence guard before committing an open buffer, so
// a stale save is rejected (409) and reconciled rather than clobbering an agent's edit (AE3-AE5).

function openDocFor(uri: vscode.Uri): vscode.TextDocument | undefined {
  const target = uri.toString();
  return vscode.workspace.textDocuments.find((d) => d.uri.toString() === target);
}

/**
 * Build the persist closure the request handler calls for one document's mutations. `onWrite` is
 * called with the LF content just persisted (both paths), so the file watcher can suppress the
 * watcher event our own write triggers (U5).
 */
export function makePersist(
  uri: vscode.Uri,
  onWrite?: (lfContent: string) => void
): (expectedVersion: string | undefined, transform: (src: string) => string) => Promise<DocPayload> {
  return async (expectedVersion, transform) => {
    const open = openDocFor(uri);
    if (open) {
      const source = toLf(open.getText());
      let written: string | undefined;
      const payload = persistDocument(
        { filePath: uri.fsPath, source, expectedVersion, write: (t) => { written = t; } },
        transform
      );
      await commitToBuffer(open, written!, expectedVersion);
      onWrite?.(written!);
      return payload;
    }
    const { source, eol } = readDocument(uri.fsPath);
    return persistDocument(
      {
        filePath: uri.fsPath,
        source,
        expectedVersion,
        write: (t) => {
          writeDocument(uri.fsPath, t, eol);
          onWrite?.(t);
        },
      },
      transform
    );
  };
}

/**
 * Commit new content to an open document: replace the whole buffer via a WorkspaceEdit (keeping undo
 * and dirty state coherent), re-applying the document's own EOL, then save so the file reflects the
 * note for the agent and other tools.
 *
 * Two guards keep a concurrent agent write from being lost. For a clean buffer, the on-disk content
 * must still match the version we transformed - otherwise an external writer changed disk and the
 * clean buffer simply has not auto-reloaded yet, so we abort (409). For a dirty buffer (disk and
 * buffer legitimately differ by the user's unsaved edits), we rely on VS Code's own save-conflict
 * detection: a save that does not land returns false, which we surface as a conflict. Nothing is
 * overwritten silently in either case.
 */
async function commitToBuffer(
  doc: vscode.TextDocument,
  lfText: string,
  expectedVersion: string | undefined
): Promise<void> {
  if (!doc.isDirty) {
    const diskNow = readDocument(doc.uri.fsPath).source;
    if (shortHash(diskNow) !== expectedVersion) {
      throw new NoteMutationError('document changed on disk since the page loaded', 409);
    }
  }

  const eol: '\r\n' | '\n' = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  edit.replace(doc.uri, fullRange, applyEol(lfText, eol));

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new NoteMutationError('could not apply the note to the open document; reload and retry', 409);
  }
  const saved = await doc.save();
  if (!saved) {
    throw new NoteMutationError('the file changed on disk; resolve the conflict and retry', 409);
  }
}
