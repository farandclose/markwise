#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { lintText } from './lint.js';
import { fixText } from './fix.js';
import type { Finding } from './types.js';

const USAGE = `markwise - a human-agent review layer for markdown

Usage:
  markwise lint <file...> [--fix] [--strict] [--json]

Options:
  --fix      Repair mechanical anchor fields (hash, before/after) in place. Never edits prose.
  --strict   Treat warnings as failures (non-zero exit).
  --json     Emit findings as JSON instead of text.
  -h, --help Show this help.

Exit codes:
  0  clean (or only warnings, without --strict)
  1  one or more errors (or warnings with --strict)
  2  usage error / file not found
`;

interface Args {
  command: string | null;
  files: string[];
  fix: boolean;
  strict: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: null, files: [], fix: false, strict: false, json: false, help: false };
  for (const a of argv) {
    if (a === '--fix') args.fix = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--json') args.json = true;
    else if (a === '-h' || a === '--help') args.help = true;
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
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      process.stderr.write(`markwise: cannot read ${file}\n`);
      return 2;
    }

    let fixChanges: string[] = [];
    if (args.fix) {
      const { output, changes } = fixText(source);
      fixChanges = changes;
      if (output !== source) {
        writeFileSync(file, output, 'utf8');
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === null) {
    process.stdout.write(USAGE);
    process.exit(args.command === null && !args.help ? 2 : 0);
  }
  if (args.command === 'lint') {
    process.exit(lintCommand(args));
  }
  process.stderr.write(`markwise: unknown command "${args.command}"\n\n${USAGE}`);
  process.exit(2);
}

main();
