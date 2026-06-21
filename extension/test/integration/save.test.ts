import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { createNote, shortHash, toLf } from 'markwise';
import { makePersist } from '../../src/save';

// The save bridge against VS Code's real file model: disk path, open-editor path, dirty buffers, the
// version gate, and the three-writer case (KTD3, R3/R6, AE3-AE5). White-box: it drives makePersist
// directly (the engine is bundled into this test), which is the same closure the panel calls.

const SRC = '# Plan\n\nThe quick brown fox.\n';
// "quick" sits at offsets 12..17 in SRC.
const commentOnQuick = (src: string): string =>
  createNote(src, { kind: 'span', start: 12, end: 17, body: 'why this word?', at: '2026-01-01T00:00:00Z', type: 'comment' }).output;

function tmpMd(content: string): vscode.Uri {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-save-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, content, 'utf8');
  return vscode.Uri.file(file);
}

suite('save bridge', () => {
  test('not-open path: a comment is written to disk', async () => {
    const uri = tmpMd(SRC);
    const persist = makePersist(uri);
    const payload = await persist(shortHash(SRC), commentOnQuick);
    assert.strictEqual(payload.openCount, 1);
    assert.ok(fs.readFileSync(uri.fsPath, 'utf8').includes('mw:log'), 'note persisted to disk');
  });

  test('not-open path: a CRLF file stays CRLF', async () => {
    const uri = tmpMd(SRC.replace(/\n/g, '\r\n'));
    const persist = makePersist(uri);
    await persist(shortHash(SRC), commentOnQuick); // version is the LF hash (engine normalizes on read)
    const disk = fs.readFileSync(uri.fsPath, 'utf8');
    assert.ok(disk.includes('\r\n'), 'CRLF preserved');
    assert.ok(!/[^\r]\n/.test(disk), 'no lone LF introduced');
  });

  test('open path: a note lands in both the buffer and on disk, leaving it clean', async () => {
    const uri = tmpMd(SRC);
    const doc = await vscode.workspace.openTextDocument(uri);
    const persist = makePersist(uri);
    await persist(shortHash(toLf(doc.getText())), commentOnQuick);
    assert.ok(toLf(doc.getText()).includes('mw:log'), 'note in the buffer');
    assert.ok(fs.readFileSync(uri.fsPath, 'utf8').includes('mw:log'), 'note saved to disk');
    assert.strictEqual(doc.isDirty, false, 'buffer saved, not left dirty');
  });

  test('AE4: open with unsaved edits - the note and the unsaved edit both survive', async () => {
    const uri = tmpMd(SRC);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    await editor.edit((eb) => eb.insert(doc.positionAt(doc.getText().length), 'User added line.\n'));
    assert.ok(doc.isDirty, 'buffer is dirty before the note');

    const persist = makePersist(uri);
    await persist(shortHash(toLf(doc.getText())), commentOnQuick);

    const disk = fs.readFileSync(uri.fsPath, 'utf8');
    assert.ok(disk.includes('User added line.'), 'the unsaved edit was not lost');
    assert.ok(disk.includes('mw:log'), 'the note was written');
  });

  test('AE3: a stale version is rejected with 409 and no write', async () => {
    const uri = tmpMd(SRC);
    await vscode.workspace.openTextDocument(uri);
    const persist = makePersist(uri);
    await assert.rejects(
      () => persist('stale', commentOnQuick),
      (e: unknown) => (e as { status?: number }).status === 409
    );
    assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf8'), SRC, 'file untouched');
  });

  test('AE5: agent writes disk while the buffer is dirty - the agent edit is not clobbered', async () => {
    const uri = tmpMd(SRC);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    await editor.edit((eb) => eb.insert(doc.positionAt(doc.getText().length), 'Unsaved user edit.\n'));
    const bufferVersion = shortHash(toLf(doc.getText()));

    // The agent writes the file on disk, diverging from the dirty buffer.
    fs.writeFileSync(uri.fsPath, SRC + '\nAgent appended this.\n', 'utf8');

    const persist = makePersist(uri);
    let conflicted = false;
    try {
      await persist(bufferVersion, commentOnQuick);
    } catch (e) {
      conflicted = (e as { status?: number }).status === 409;
    }

    const disk = fs.readFileSync(uri.fsPath, 'utf8');
    assert.ok(disk.includes('Agent appended this.'), 'the agent edit must survive (no clobber)');
    assert.ok(conflicted, 'the conflicting save is surfaced as a 409');
  });
});
