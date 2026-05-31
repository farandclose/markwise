// `markwise prompt` - assembles the briefing you hand to an agent: the model-agnostic instruction
// block (AGENT_PROMPT.md or AUTHOR_PROMPT.md) with <CURRENT_TIME> filled in, optionally a short
// list of the notes currently waiting on the agent, then the document itself (D7, D20). The
// instruction templates are filled here, not maintained here - the .md files stay canonical.
//
// `now` is injected rather than read from the clock so this stays a pure, testable function.

export interface PromptNoteRef {
  id: string;
  type: string;
}

export interface PromptInput {
  template: string; // AGENT_PROMPT.md or AUTHOR_PROMPT.md content
  document: string; // the markdown file being reviewed
  now: string; // ISO timestamp to substitute for <CURRENT_TIME>
  /** Open notes the agent should act on now (reviewer spoke last). Omit for authoring mode. */
  waitingOnAgent?: PromptNoteRef[];
}

export function buildPromptOutput(input: PromptInput): string {
  const filled = input.template.split('<CURRENT_TIME>').join(input.now);

  let todo = '';
  if (input.waitingOnAgent && input.waitingOnAgent.length > 0) {
    const list = input.waitingOnAgent.map((n) => `- ${n.id} (${n.type})`).join('\n');
    todo =
      `\n\n## Notes waiting on you right now\n\n` +
      `These open notes have the reviewer's message last, so they are yours to act on. ` +
      `Any note not listed here is resolved or waiting on the reviewer - leave it untouched.\n\n` +
      `${list}\n`;
  }

  return `${filled}${todo}\n\n---\n\n${input.document}`;
}
