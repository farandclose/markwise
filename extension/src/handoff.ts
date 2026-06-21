import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { shortHash } from 'markwise';
import { readSourceLf } from './docio';
import { buildBriefing, composeLaunchCommand } from './handoffCore';
import type { ApiResult } from './requestHandler';

// The editor handoff (KTD5, R4): compose the briefing in-process and launch a FRESH agent in a new
// terminal with it - no manual paste, no localhost server, no rendezvous/doorbell (all server-bound),
// and no injecting into an already-running TUI (which the Ink-TUI does not reliably accept). If no
// agent command is configured or the launch fails, fall back to copying the briefing to the clipboard.

const CONFIG_SECTION = 'markwise';

function readTemplate(context: vscode.ExtensionContext): string {
  const uri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'assets', 'AGENT_PROMPT.md');
  return readFileSync(uri.fsPath, 'utf8');
}

/** Build the handoff closure the request handler calls for POST /api/handoff. */
export function makeHandoff(
  context: vscode.ExtensionContext,
  uri: vscode.Uri
): () => Promise<ApiResult> {
  return async () => {
    const source = readSourceLf(uri);
    const template = readTemplate(context);
    const now = new Date().toISOString();
    const briefing = buildBriefing(template, source, uri.fsPath, now);

    const agentCommand = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<string>('handoff.agentCommand', 'claude')
      .trim();

    if (agentCommand) {
      try {
        const briefingPath = path.join(os.tmpdir(), `markwise-handoff-${shortHash(briefing + now)}.md`);
        writeFileSync(briefingPath, briefing, 'utf8');
        const cwd =
          vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? path.dirname(uri.fsPath);
        const terminal = vscode.window.createTerminal({ name: 'Markwise handoff', cwd });
        terminal.show();
        terminal.sendText(composeLaunchCommand({ agentCommand, briefingPath, docPath: uri.fsPath }));
        // ok:true -> the previewer toasts "Handed off ...".
        return { ok: true, status: 200, body: { handed: true } };
      } catch {
        // fall through to the clipboard fallback
      }
    }

    // ok:false -> the previewer toasts "Copied to clipboard - paste into your agent."
    await vscode.env.clipboard.writeText(briefing);
    return { ok: false, status: 200, body: { handed: false } };
  };
}
