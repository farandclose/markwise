// The `agent-setup` command's output: a short paste-able header (what a user drops into a fresh
// agent session) followed by SETUP_PROMPT.md verbatim (what an agent that already has the CLI
// follows). The CLI only PRINTS this - it never edits instruction files itself (spec: the agent
// does the injection, RoughDraft-style). The GitHub install spec below is one of exactly two
// occurrences in the codebase (the other is SETUP_PROMPT.md); an npm publish later edits both.

export interface SetupOutputInput {
  template: string; // SETUP_PROMPT.md content
}

const PASTE_HEADER =
  'To set up your coding agent, paste this into it:\n\n' +
  'Install Markwise for me with `npm i -g github:farandclose/markwise`, then run `markwise agent-setup` and follow what it prints.\n';

export function buildSetupOutput(input: SetupOutputInput): string {
  return PASTE_HEADER + '\n---\n\n' + input.template;
}
