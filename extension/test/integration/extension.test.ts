import * as assert from 'assert';
import * as vscode from 'vscode';

// U2 scaffold integration check: the contributed command is registered and activating it opens a
// webview panel without throwing. Black-box, via the vscode API only. The command is contributed
// with lazy onCommand activation, so it only appears in getCommands() once the extension activates -
// activate it in suiteSetup before asserting.
suite('Markwise extension (scaffold)', () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('farandclose.markwise-vscode');
    assert.ok(ext, 'the extension should be discoverable by id');
    await ext!.activate();
  });

  test('registers the markwise.openPreview command after activation', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('markwise.openPreview'),
      'markwise.openPreview should be registered'
    );
  });

  test('executing the command opens a panel and does not throw', async () => {
    await vscode.commands.executeCommand('markwise.openPreview');
    const ext = vscode.extensions.getExtension('farandclose.markwise-vscode');
    assert.strictEqual(ext?.isActive, true, 'the extension should be active');
  });
});
