import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { parseInboundMessage, type ApiResponseMessage } from './messages';
import { handleApiRequest, type HandlerDeps } from './requestHandler';
import { sanitizeDocumentHtml } from './sanitize';
import { readSourceLf } from './docio';

// The webview panel: presentation only. The host templates the page (the engine's index.html cannot
// be copied verbatim - its root-absolute /app.css and /app.js refs must become asWebviewUri outputs
// and its inline theme-bootstrap script must go, since a strict CSP forbids inline script). A
// per-load nonce authorizes the two external scripts (the transport shim, then the previewer); a
// default-src 'none' CSP blocks everything else. Every inbound message is validated (KTD6) before it
// reaches the engine, and every rendered payload is sanitized (R7) on its way out in the handler.

interface PanelExtras {
  /** Wired by U4 (save) and U6 (handoff); U3 renders read-only. */
  persist?: HandlerDeps['persist'];
  handoff?: HandlerDeps['handoff'];
}

export function openPreview(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
  extras: PanelExtras = {}
): vscode.WebviewPanel {
  const assetRoot = vscode.Uri.joinPath(context.extensionUri, 'dist', 'assets');

  const panel = vscode.window.createWebviewPanel(
    'markwise.preview',
    `Markwise: ${shortTitle(uri)}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [assetRoot],
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = renderHtml(panel.webview, assetRoot);

  const deps: HandlerDeps = {
    read: () => readSourceLf(uri),
    filePath: uri.fsPath,
    sanitizeHtml: sanitizeDocumentHtml,
    now: () => new Date().toISOString(),
    persist: extras.persist,
    handoff: extras.handoff,
  };

  panel.webview.onDidReceiveMessage(
    async (raw) => {
      const msg = parseInboundMessage(raw);
      if (!msg) return; // not in the closed type set - drop it
      const result = await handleApiRequest(msg, deps);
      const response: ApiResponseMessage = {
        type: 'apiResponse',
        id: msg.id,
        ok: result.ok,
        status: result.status,
        body: result.body,
      };
      // The panel may have been disposed while a mutate awaited; postMessage is a no-op then.
      void panel.webview.postMessage(response);
    },
    undefined,
    context.subscriptions
  );

  return panel;
}

function shortTitle(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] || 'document';
}

function renderHtml(webview: vscode.Webview, assetRoot: vscode.Uri): string {
  const nonce = randomBytes(16).toString('hex');
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, 'app.css'));
  const bridgeUri = webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, 'bridge.js'));
  const appUri = webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, 'app.js'));

  // default-src 'none': nothing loads unless explicitly allowed. Scripts run only with this load's
  // nonce (so injected/inline script cannot execute - R7). Styles allow 'unsafe-inline' because the
  // previewer sets a few presentational style attributes at runtime (theme swatches); inline CSS
  // cannot execute code, so this does not weaken the script protection. Images allow https/data so
  // markdown images render, matching the browser previewer.
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!doctype html>
<html lang="en" data-theme="sepia">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Markwise Preview</title>
    <link rel="stylesheet" href="${cssUri}" />
    <script nonce="${nonce}" src="${bridgeUri}"></script>
  </head>
  <body class="mw-clean">
    <header class="mw-toolbar">
      <div class="mw-brand">
        <span class="mw-wordmark">Markwise</span>
        <span class="mw-doctitle"></span>
      </div>
      <div class="mw-tools">
        <button type="button" class="mw-theme" aria-label="Switch theme" title="Switch theme" aria-haspopup="menu" aria-expanded="false">◐</button>
        <button type="button" class="mw-counter" aria-pressed="false">
          <span class="mw-count">0</span> notes
        </button>
        <button type="button" class="mw-handoff" disabled>
          Hand to agent
        </button>
      </div>
    </header>
    <main class="mw-stage">
      <article class="mw-doc" aria-label="document"></article>
      <aside class="mw-rail" aria-label="notes"></aside>
    </main>
    <script nonce="${nonce}" src="${appUri}"></script>
  </body>
</html>`;
}
