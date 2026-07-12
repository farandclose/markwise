#!/usr/bin/env node
import { readFileSync, writeFileSync, accessSync, constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { lintText } from './lint.js';
import { fixText } from './fix.js';
import { status, type StatusReport } from './status.js';
import { buildPromptOutput } from './prompt.js';
import { buildSetupOutput } from './setup.js';
import { stripText } from './strip.js';
import { readDocument, writeDocument, applyEol } from './eol.js';
import { createPreviewServer } from './preview/server.js';
import { writeRendezvous, removeRendezvous } from './preview/rendezvous.js';
import { waitForHandoff } from './preview/wait.js';
import { runFeedbackCommand, FEEDBACK_ENDPOINT, type FeedbackMeta } from './feedback.js';
import type { Finding } from './types.js';

const USAGE = `markwise - a human-agent review layer for markdown

Usage:
  markwise lint <file...> [--fix] [--strict] [--json]
  markwise status <file...> [--json]
  markwise prompt <file> [--author] [--wait]
  markwise export <file> [--output <path>]   (alias: strip)
  markwise agent-setup                       (alias: setup) print coding-agent setup instructions
  markwise preview <file>                    open the document in a local web previewer
  markwise feedback                          send feedback to the maintainer (posts a public GitHub issue)

Options:
  --fix             Repair mechanical anchor fields (hash, before/after) in place. Never edits prose.
  --strict          Treat warnings as failures (non-zero exit).
  --json            Emit output as JSON instead of text.
  --author          prompt: emit the note-authoring block instead of the revise/respond block.
  --wait            prompt: block until the preview's "Hand to agent" button is clicked, then
                    emit the briefing. Run in the background beside markwise preview <file>.
  -o, --output <p>  export: write the clean copy to <p> instead of stdout.
  -h, --help        Show this help.

Notes:
  export/strip removes all Markwise data and writes a clean copy. It NEVER modifies the original.

Exit codes:
  0  clean (or only warnings, without --strict); status/export always exit 0 on success
  1  one or more errors (or warnings with --strict)
  2  usage error / file not found
`;

interface Args {
  command: string | null;
  files: string[];
  fix: boolean;
  strict: boolean;
  json: boolean;
  author: boolean;
  wait: boolean;
  output: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: null,
    files: [],
    fix: false,
    strict: false,
    json: false,
    author: false,
    wait: false,
    output: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--fix') args.fix = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--json') args.json = true;
    else if (a === '--author') args.author = true;
    else if (a === '--wait') args.wait = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else if (a === '-o' || a === '--output') args.output = argv[++i] ?? null;
    else if (a.startsWith('--output=')) args.output = a.slice('--output='.length);
    else if (a.startsWith('-')) {
      process.stderr.write(`markwise: unknown option ${a}\n`);
      process.exit(2);
    } else if (args.command === null) args.command = a;
    else args.files.push(a);
  }
  return args;
}

function formatFinding(file: string, f: Finding): string {
  const where = f.line !== undefined ? `${file}:${f.line}` : file;
  const fixTag = f.fixable ? ' (fixable)' : '';
  const idTag = f.id ? ` [${f.id}]` : '';
  return `  ${where}  ${f.severity.padEnd(7)} ${f.rule}  ${f.message}${idTag}${fixTag}`;
}

function lintCommand(args: Args): number {
  if (args.files.length === 0) {
    process.stderr.write('markwise lint: no input file\n');
    return 2;
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const jsonOut: Array<{ file: string; findings: Finding[] }> = [];

  for (const file of args.files) {
    let source: string;
    let eol: '\r\n' | '\n';
    try {
      ({ source, eol } = readDocument(file));
    } catch {
      process.stderr.write(`markwise: cannot read ${file}\n`);
      return 2;
    }

    let fixChanges: string[] = [];
    if (args.fix) {
      const { output, changes } = fixText(source);
      fixChanges = changes;
      if (output !== source) {
        writeDocument(file, output, eol);
        source = output;
      }
    }

    const findings = lintText(source, { strict: args.strict });
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.length - errors;
    totalErrors += errors;
    totalWarnings += warnings;

    if (args.json) {
      jsonOut.push({ file, findings });
      continue;
    }

    // Always report what --fix did, including the "nothing to do" case, so the command never
    // looks like a silent no-op. --fix only mends mechanical fields (hash, before/after); it
    // cannot repair structural problems (fences, markers, schema) - those need manual edits.
    if (args.fix) {
      if (fixChanges.length > 0) {
        process.stdout.write(`Fixed ${file}: ${fixChanges.join(', ')}\n`);
      } else {
        const remaining = findings.length;
        const note =
          remaining > 0
            ? ` (${remaining} issue${remaining === 1 ? '' : 's'} remain that --fix cannot repair - structural/schema problems need manual edits)`
            : '';
        process.stdout.write(`--fix: no mechanically-repairable issues in ${file}${note}\n`);
      }
    }

    if (findings.length === 0) {
      process.stdout.write(`${file}: clean\n`);
    } else {
      process.stdout.write(`${file}:\n`);
      for (const f of findings) process.stdout.write(formatFinding(file, f) + '\n');
    }
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(jsonOut, null, 2) + '\n');
  } else {
    const parts: string[] = [];
    parts.push(`${totalErrors} error${totalErrors === 1 ? '' : 's'}`);
    parts.push(`${totalWarnings} warning${totalWarnings === 1 ? '' : 's'}`);
    process.stdout.write(`\n${parts.join(', ')}\n`);
  }

  if (totalErrors > 0) return 1;
  if (args.strict && totalWarnings > 0) return 1;
  return 0;
}

function formatStatus(file: string, r: StatusReport): string {
  const lines: string[] = [];
  lines.push(`${file}: ${r.open} open, ${r.resolved} resolved (${r.total} total)`);

  lines.push('');
  lines.push(`  Waiting on you (${r.waitingOnYou.length}):`);
  if (r.waitingOnYou.length === 0) lines.push('    nothing needs your input right now');
  else for (const n of r.waitingOnYou) lines.push(`    ${n.id}  ${n.type.padEnd(8)} ${n.reason}`);

  lines.push('');
  lines.push(`  Waiting on the agent (${r.waitingOnAgent.length}):`);
  if (r.waitingOnAgent.length === 0) lines.push('    nothing pending for the agent');
  else for (const n of r.waitingOnAgent) lines.push(`    ${n.id}  ${n.type.padEnd(8)} ${n.reason}`);

  if (r.needsClarification > 0) {
    lines.push('');
    lines.push(`  ${r.needsClarification} of those need your answer (the agent asked a question).`);
  }
  return lines.join('\n');
}

function statusCommand(args: Args): number {
  if (args.files.length === 0) {
    process.stderr.write('markwise status: no input file\n');
    return 2;
  }

  const jsonOut: Array<{ file: string; status: StatusReport }> = [];
  for (const file of args.files) {
    let source: string;
    try {
      ({ source } = readDocument(file));
    } catch {
      process.stderr.write(`markwise: cannot read ${file}\n`);
      return 2;
    }
    const report = status(source);
    if (args.json) jsonOut.push({ file, status: report });
    else process.stdout.write(formatStatus(file, report) + '\n');
  }

  if (args.json) process.stdout.write(JSON.stringify(jsonOut, null, 2) + '\n');
  return 0;
}

/**
 * Assemble the briefing `markwise prompt` hands to an agent: the instruction template with the
 * time filled in, the notes currently waiting on the agent (revise/respond mode), and the document
 * itself. Reads the file fresh, so callers get the document as it stands right now (the --wait path
 * relies on this to capture the state at the moment of handoff). Returns the text, or an exit code
 * on a read/template error (the message is written to stderr here).
 */
function assembleBriefing(file: string, author: boolean): { text: string } | { code: number } {
  let document: string;
  try {
    ({ source: document } = readDocument(file));
  } catch {
    process.stderr.write(`markwise: cannot read ${file}\n`);
    return { code: 2 };
  }

  const templateFile = author ? 'AUTHOR_PROMPT.md' : 'AGENT_PROMPT.md';
  let template: string;
  try {
    template = readFileSync(new URL(`../${templateFile}`, import.meta.url), 'utf8');
  } catch {
    process.stderr.write(`markwise: cannot find ${templateFile} in the package\n`);
    return { code: 2 };
  }

  // In revise/respond mode, point the agent at the notes that are its turn (reviewer spoke last).
  const waitingOnAgent = author
    ? undefined
    : status(document).waitingOnAgent.map((n) => ({ id: n.id, type: n.type }));

  const now = new Date().toISOString();
  return { text: buildPromptOutput({ template, document, now, waitingOnAgent }) };
}

function promptCommand(args: Args): number {
  if (args.files.length !== 1) {
    process.stderr.write('markwise prompt: expects exactly one input file\n');
    return 2;
  }
  const briefing = assembleBriefing(args.files[0]!, args.author);
  if ('code' in briefing) return briefing.code;
  process.stdout.write(briefing.text + '\n');
  return 0;
}

/**
 * `markwise prompt <file> --wait`: block until the human clicks "Hand to agent" in the running
 * preview, then emit the briefing. The preview keeps serving throughout (the agent edits while the
 * human watches). Meant to be launched in the background alongside `markwise preview <file>`; its
 * clean exit with the briefing on stdout is what hands the baton back to the launching agent.
 */
async function promptWaitCommand(args: Args): Promise<number> {
  if (args.files.length !== 1) {
    process.stderr.write('markwise prompt: expects exactly one input file\n');
    return 2;
  }
  const file = args.files[0]!;

  const result = await waitForHandoff(file);
  if (result === 'no-preview') {
    process.stderr.write(
      `markwise prompt --wait: no live preview found for ${file}\n` +
        `  start one first with \`markwise preview ${file}\` (in the background), then hand off from the browser.\n`
    );
    return 2;
  }
  if (result === 'gone') {
    process.stderr.write(`markwise prompt --wait: the preview for ${file} is no longer running\n`);
    return 1;
  }

  const briefing = assembleBriefing(file, args.author);
  if ('code' in briefing) return briefing.code;
  process.stdout.write(briefing.text + '\n');
  return 0;
}

function agentSetupCommand(args: Args): number {
  if (args.files.length > 0) {
    process.stderr.write('markwise agent-setup: takes no arguments\n');
    return 2;
  }
  let template: string;
  try {
    template = readFileSync(new URL('../SETUP_PROMPT.md', import.meta.url), 'utf8');
  } catch {
    process.stderr.write('markwise: cannot find SETUP_PROMPT.md in the package\n');
    return 2;
  }
  process.stdout.write(buildSetupOutput({ template }) + '\n');
  return 0;
}

function collectFeedbackMeta(): FeedbackMeta {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { version: string };
  return { version: pkg.version, platform: process.platform, node: process.version };
}

// async so sync throws (e.g. unreadable package.json) become rejections the dispatch .catch() handles
async function feedbackCommand(): Promise<number> {
  return runFeedbackCommand({
    input: process.stdin,
    output: process.stdout,
    fetchImpl: fetch,
    endpoint: process.env['MARKWISE_FEEDBACK_URL'] ?? FEEDBACK_ENDPOINT,
    meta: collectFeedbackMeta(),
    openBrowser,
    writeDraft: (content) => {
      const path = 'markwise-feedback-draft.md';
      writeFileSync(path, content, 'utf8');
      return path;
    },
  });
}

function exportCommand(args: Args): number {
  if (args.files.length !== 1) {
    process.stderr.write('markwise export: expects exactly one input file\n');
    return 2;
  }
  const file = args.files[0]!;

  let source: string;
  let eol: '\r\n' | '\n';
  try {
    ({ source, eol } = readDocument(file));
  } catch {
    process.stderr.write(`markwise: cannot read ${file}\n`);
    return 2;
  }

  const clean = stripText(source);

  if (args.output) {
    try {
      writeDocument(args.output, clean, eol);
    } catch {
      process.stderr.write(`markwise: cannot write ${args.output}\n`);
      return 2;
    }
    process.stderr.write(`Wrote clean copy to ${args.output} (original untouched)\n`);
  } else {
    process.stdout.write(applyEol(clean, eol));
  }
  return 0;
}

function openBrowser(url: string): void {
  // Best-effort. Failure is non-fatal: the URL is already printed for the reviewer to open.
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* ignore */
  }
}

function previewCommand(args: Args): void {
  if (args.files.length !== 1) {
    process.stderr.write('markwise preview: expects exactly one input file\n');
    process.exit(2);
  }
  const file = args.files[0]!;
  try {
    accessSync(file, constants.R_OK);
  } catch {
    process.stderr.write(`markwise: cannot read ${file}\n`);
    process.exit(2);
  }

  const server = createPreviewServer(file);
  server.on('error', (err) => {
    process.stderr.write(`markwise preview: server error: ${(err as Error).message}\n`);
    process.exit(1);
  });
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const url = `http://127.0.0.1:${port}/`;
    // Advertise the dynamic port so `markwise prompt <file> --wait` can find this server.
    writeRendezvous(file, { port, pid: process.pid });
    process.stdout.write(`markwise preview: serving ${file}\n  ${url}\n  (Ctrl+C to stop)\n`);
    openBrowser(url);
  });
  // Remove the advert when the preview goes away, so a later `--wait` never chases a dead port.
  const cleanup = (): void => removeRendezvous(file);
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  // Intentionally does not return / exit: the listening server keeps the event loop alive.
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === null) {
    process.stdout.write(USAGE);
    process.exit(args.command === null && !args.help ? 2 : 0);
  }
  if (args.command === 'preview') {
    previewCommand(args);
    return; // long-running; do not process.exit
  }
  if (args.command === 'lint') {
    process.exit(lintCommand(args));
  }
  if (args.command === 'status') {
    process.exit(statusCommand(args));
  }
  if (args.command === 'prompt') {
    if (args.wait) {
      // Long-running until the human hands off; resolve asynchronously, do not exit synchronously.
      // Map any unexpected rejection to a clean non-zero exit so the launching agent never sees an
      // unhandled rejection instead of a deterministic exit code.
      promptWaitCommand(args)
        .then((code) => process.exit(code))
        .catch((err) => {
          process.stderr.write(`markwise prompt --wait: ${(err as Error).message}\n`);
          process.exit(1);
        });
      return;
    }
    process.exit(promptCommand(args));
  }
  if (args.command === 'agent-setup' || args.command === 'setup') {
    process.exit(agentSetupCommand(args));
  }
  if (args.command === 'export' || args.command === 'strip') {
    process.exit(exportCommand(args));
  }
  if (args.command === 'feedback') {
    if (args.files.length > 0) {
      process.stderr.write('markwise feedback: takes no file arguments\n');
      process.exit(2);
    }
    feedbackCommand()
      .then((code) => process.exit(code))
      .catch((err) => {
        process.stderr.write(`markwise feedback: ${(err as Error).message}\n`);
        process.exit(1);
      });
    return;
  }
  process.stderr.write(`markwise: unknown command "${args.command}"\n\n${USAGE}`);
  process.exit(2);
}

main();
