import * as vscode from 'vscode';
import { readDocument, shortHash } from 'markwise';
import { SelfWriteSuppressor, Debouncer } from './watchCore';

// FileSystemWatcher-driven refresh (KTD4, R5): when the file changes on disk - chiefly an agent's
// write after a handoff - re-read it and signal the panel to repaint; the panel's own saves are
// suppressed by content hash so they do not flicker. Reading the agent's terminal output is
// explicitly NOT the refresh signal; the file is.
//
// Ordering assumption: the watcher event for our own write may arrive before OR after makePersist
// records the written hash. We absorb that race by debouncing and checking the hash at flush time -
// the debounce window covers the gap. If the assumption is violated (event flushes before the hash is
// recorded), the only consequence is one redundant repaint to identical content, which the previewer
// drops anyway because the document version is unchanged. No event is ever lost; at worst one is
// redundant.
//
// Note on an open editor: when the file is also open in an editor tab, the panel renders the buffer
// (KTD3), so an external disk write surfaces in the panel once VS Code reconciles the buffer (auto-
// reload for a clean buffer; the conflict indicator for a dirty one). The primary refresh case - the
// file open only in the panel while an agent edits it on disk - re-reads disk directly and repaints.

export interface FileWatch extends vscode.Disposable {
  /** Record a self-write (the LF content just persisted) so its watcher event is not seen as external. */
  noteSelfWrite(lfContent: string): void;
}

export function watchFile(
  uri: vscode.Uri,
  onRefresh: () => void,
  opts: { debounceMs?: number; suppressor?: SelfWriteSuppressor } = {}
): FileWatch {
  const suppressor = opts.suppressor ?? new SelfWriteSuppressor();
  const dir = vscode.Uri.joinPath(uri, '..');
  const name = uri.path.split('/').pop() ?? '';
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, name));

  // The last content version we have already accounted for. Seeded with the file's current content so
  // a spurious initial event (some platforms replay the file's existing state when a watcher arms)
  // does not read as a change. Updated on every flush so we refresh only on a real version change -
  // the same version-diff guard the previewer client uses.
  const readHash = (): string | undefined => {
    try {
      return shortHash(readDocument(uri.fsPath).source);
    } catch {
      return undefined; // file vanished or unreadable mid-flight
    }
  };
  let lastSeen = readHash();

  const debouncer = new Debouncer(opts.debounceMs ?? 150, () => {
    const hash = readHash();
    if (hash === undefined || hash === lastSeen) return; // unreadable, or no real change
    lastSeen = hash;
    if (suppressor.isSelfWrite(hash)) return; // disk shows our own write - swallow it
    onRefresh();
  });

  const schedule = () => debouncer.schedule();
  watcher.onDidChange(schedule);
  watcher.onDidCreate(schedule);

  return {
    noteSelfWrite: (lfContent: string) => suppressor.record(shortHash(lfContent)),
    dispose: () => {
      debouncer.dispose();
      watcher.dispose();
    },
  };
}
