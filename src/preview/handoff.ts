// Builds the clipboard "pickup ticket" the previewer's Hand-to-agent button copies. Pure and
// I/O-free, so it is trivially testable. The text references the protocol via `markwise prompt`
// rather than restating it (design D-b), and names the file by path rather than inlining it
// (design D-a). No em-dashes; avoid `--`/`-->` so a pasted ticket never confuses an HTML-comment
// parser (consistent with the protocol's own rule).

export interface HandoffInput {
  /** The path `markwise preview` was launched with. */
  path: string;
  /** How many open notes are the agent's turn (status(src).waitingOnAgent.length). */
  waitingCount: number;
}

export function buildHandoffText({ path, waitingCount }: HandoffInput): string {
  const countPhrase =
    waitingCount === 1 ? '1 note is waiting on you' : `${waitingCount} notes are waiting on you`;
  return (
    `A Markwise review of \`${path}\` just finished. ${countPhrase}.\n\n` +
    `Run \`markwise prompt ${path}\` to load the protocol and those notes, then act on them.`
  );
}
