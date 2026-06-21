import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { createNote } from 'markwise';
import { makeHandoff } from '../../src/handoff';

// The editor handoff against the real vscode API (R4/R7): with a command configured it launches a
// fresh agent in a new terminal; with none it copies the briefing to the clipboard. The briefing
// composition and shell-quoting are covered headless by the handoffCore vitest tests; this confirms
// the terminal/clipboard wiring. A harmless `echo` command is configured so no real agent spawns.

const noteDoc = createNote('# Plan\n\nThe quick brown fox.\n', {
  kind: 'span', start: 12, end: 17, body: 'rewrite this', at: '2026-01-01T00:00:00Z', type: 'comment',
}).output;

function tmpMd(content: string): vscode.Uri {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-handoff-'));
  fs.writeFileSync(path.join(dir, 'doc.md'), content, 'utf8');
  return vscode.Uri.file(path.join(dir, 'doc.md'));
}

const config = () => vscode.workspace.getConfiguration('markwise');

suite('handoff', () => {
  let context: vscode.ExtensionContext;
  let uri: vscode.Uri;

  suiteSetup(() => {
    const ext = vscode.extensions.getExtension('farandclose.markwise-vscode');
    assert.ok(ext, 'extension discoverable');
    context = { extensionUri: ext!.extensionUri } as vscode.ExtensionContext;
    uri = tmpMd(noteDoc);
  });

  suiteTeardown(async () => {
    await config().update('handoff.agentCommand', undefined, vscode.ConfigurationTarget.Global);
  });

  test('launches a fresh agent in a new terminal when a command is configured', async () => {
    await config().update('handoff.agentCommand', 'echo', vscode.ConfigurationTarget.Global);
    const res = await makeHandoff(context, uri)();
    assert.strictEqual(res.ok, true, 'handoff reports success');
    const term = vscode.window.terminals.find((t) => t.name === 'Markwise handoff');
    assert.ok(term, 'a "Markwise handoff" terminal should be created');
    term?.dispose();
  });

  test('falls back to copying the briefing to the clipboard when no command is configured', async () => {
    await config().update('handoff.agentCommand', '', vscode.ConfigurationTarget.Global);
    const res = await makeHandoff(context, uri)();
    assert.strictEqual(res.ok, false, 'handoff reports the clipboard fallback');
    const clip = await vscode.env.clipboard.readText();
    assert.ok(clip.includes('Markwise review'), 'the briefing was copied');
    assert.ok(clip.includes(uri.fsPath), 'the briefing names the file under review');
    assert.ok(/Notes waiting on you/i.test(clip), 'the briefing lists the waiting note');
  });
});
