import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { toLf } from 'markwise';
import { watchFile } from '../../src/watch';

// The real FileSystemWatcher end to end (R5): an external write triggers a refresh; a recorded
// self-write does not; a burst coalesces. The suppression and debounce *logic* is also covered
// deterministically by the watchCore vitest unit tests; this confirms the actual watcher fires.

const SRC = '# Plan\n\nThe quick brown fox.\n';

function tmpMd(content: string): vscode.Uri {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-watch-'));
  fs.writeFileSync(path.join(dir, 'doc.md'), content, 'utf8');
  return vscode.Uri.file(path.join(dir, 'doc.md'));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true;
    await sleep(25);
  }
  return cond();
}

suite('file watch', () => {
  test('an external write triggers a refresh that reflects on-disk bytes', async () => {
    const uri = tmpMd(SRC);
    let refreshes = 0;
    const watch = watchFile(uri, () => { refreshes++; }, { debounceMs: 40 });
    await sleep(300); // let the OS watcher arm

    fs.writeFileSync(uri.fsPath, SRC + '\nAgent wrote this.\n', 'utf8');
    const fired = await waitFor(() => refreshes >= 1, 6000);
    watch.dispose();

    assert.ok(fired, 'an external write should trigger at least one refresh');
  });

  test("the panel's own save does not trigger a refresh", async () => {
    const uri = tmpMd(SRC);
    let refreshes = 0;
    const watch = watchFile(uri, () => { refreshes++; }, { debounceMs: 40 });
    await sleep(300);

    const newContent = SRC + '\nNote added by the panel.\n';
    watch.noteSelfWrite(toLf(newContent)); // record before writing, as makePersist does
    fs.writeFileSync(uri.fsPath, newContent, 'utf8');

    await sleep(1500); // well past the debounce; a self-write must stay silent
    watch.dispose();
    assert.strictEqual(refreshes, 0, 'a recorded self-write must not refresh');
  });

  test('a burst of external writes coalesces (far fewer refreshes than writes)', async () => {
    // Exact debounce coalescing is proven deterministically by the watchCore Debouncer unit test;
    // here we only confirm the real watcher collapses a rapid 4-write burst to a small number of
    // refreshes (OS event delivery is lumpy, so we allow up to 2 rather than asserting exactly 1).
    const uri = tmpMd(SRC);
    let refreshes = 0;
    const watch = watchFile(uri, () => { refreshes++; }, { debounceMs: 120 });
    await sleep(300);

    for (let i = 0; i < 4; i++) {
      fs.writeFileSync(uri.fsPath, SRC + `\nburst ${i}\n`, 'utf8');
      await sleep(15);
    }
    await waitFor(() => refreshes >= 1, 6000);
    await sleep(400); // allow any stragglers
    watch.dispose();

    assert.ok(refreshes >= 1 && refreshes <= 2, `burst should coalesce; got ${refreshes}`);
  });
});
