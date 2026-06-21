import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

// Integration smoke for the panel path: black-box, via the vscode API. The deep rendering and R7
// sanitization correctness are covered headless by the vitest unit tests (requestHandler + sanitize);
// here we confirm the command, against a real markdown editor, opens a webview panel without throwing.
suite('Markwise extension', () => {
  let mdUri: vscode.Uri;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('farandclose.markwise-vscode');
    assert.ok(ext, 'the extension should be discoverable by id');
    await ext!.activate();

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mw-')), 'sample.md');
    fs.writeFileSync(file, '# Title\n\nThe quick brown fox.\n\n<img src=x onerror="alert(1)">\n', 'utf8');
    mdUri = vscode.Uri.file(file);
  });

  test('registers the markwise.openPreview command after activation', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('markwise.openPreview'), 'markwise.openPreview should be registered');
  });

  test('opening the command on a markdown file creates a webview panel', async () => {
    const doc = await vscode.workspace.openTextDocument(mdUri);
    await vscode.window.showTextDocument(doc);
    const panel = (await vscode.commands.executeCommand(
      'markwise.openPreview'
    )) as vscode.WebviewPanel;
    assert.ok(panel, 'the command should return the panel');
    // Give the panel a tick to register as a tab.
    await new Promise((r) => setTimeout(r, 200));

    const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    const webviewTab = tabs.find(
      (t) => t.input instanceof vscode.TabInputWebview && /markwise/i.test(t.input.viewType)
    );
    assert.ok(webviewTab, 'a Markwise webview panel tab should be open');
    panel.dispose();
  });

  // Confirms the live webview wiring end to end, headless: that the strict CSP lets the two external
  // scripts load (the transport shim + app.js), that acquireVsCodeApi works, that the fetch shim is
  // installed, and that the unmodified previewer boots and requests the document. If any of those
  // failed, no apiRequest would ever reach the host. (Only the visual appearance is left to F5.)
  test('the panel boots: previewer loads under CSP and requests the document over the bridge', async () => {
    const doc = await vscode.workspace.openTextDocument(mdUri);
    await vscode.window.showTextDocument(doc);
    const panel = (await vscode.commands.executeCommand(
      'markwise.openPreview'
    )) as vscode.WebviewPanel;
    assert.ok(panel, 'the command should return the panel');

    const bootRequest = await new Promise<{ method: string; url: string }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no apiRequest reached the host within the timeout')),
        10000
      );
      const sub = panel.webview.onDidReceiveMessage((msg) => {
        if (msg && msg.type === 'apiRequest' && msg.url === '/api/doc') {
          clearTimeout(timer);
          sub.dispose();
          resolve(msg);
        }
      });
    });

    assert.strictEqual(bootRequest.method, 'GET', 'the previewer should GET /api/doc on boot');
    panel.dispose();
  });
});
