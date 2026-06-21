import { buildPromptOutput, status } from 'markwise';

// Pure handoff composition (KTD5/KTD6, R4/R7): build the briefing entirely in-process and assemble a
// shell-safe terminal command. No vscode, no I/O - unit-testable headless. The vscode side (handoff.ts)
// reads the source + template, writes the briefing to a temp file, and launches the terminal.

/**
 * The full briefing a fresh agent receives: a pointer to the file under review, then the same content
 * `markwise prompt` emits (the instruction protocol with the time filled in, the notes waiting on the
 * agent, and the document). Self-contained: the agent needs no prior Markwise knowledge and no CLI.
 */
export function buildBriefing(
  template: string,
  source: string,
  filePath: string,
  now: string
): string {
  const waitingOnAgent = status(source).waitingOnAgent.map((n) => ({ id: n.id, type: n.type }));
  const body = buildPromptOutput({ template, document: source, now, waitingOnAgent });
  return (
    `You are picking up a Markwise review of the file at:\n  ${filePath}\n\n` +
    `Open that file and revise it in place to address the open notes, then reply to each in its ` +
    `thread so the reviewer can see what you did. The full protocol, the notes waiting on you, and ` +
    `the document follow.\n\n---\n\n${body}`
  );
}

/** POSIX single-quote a string so shell metacharacters inside it cannot break out (KTD6, R7). */
export function posixQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * The command sent to the new terminal: the configured agent command followed by one shell-quoted
 * prompt argument that points the agent at the briefing file and the document. Both paths live inside
 * the single quoted argument, so a path containing shell metacharacters is inert - it can never start
 * a new command (R7). The agent command itself is user-configured and trusted, used as a literal prefix.
 */
export function composeLaunchCommand(opts: {
  agentCommand: string;
  briefingPath: string;
  docPath: string;
}): string {
  const prompt =
    `Read and follow the Markwise review briefing at ${opts.briefingPath}. ` +
    `It describes how to revise and reply to the open notes in ${opts.docPath}.`;
  return `${opts.agentCommand} ${posixQuote(prompt)}`;
}
