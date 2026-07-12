// Everything testable about `markwise feedback` lives here; src/cli.ts only
// wires in the real stdin/stdout, fetch, and browser.

import { createInterface } from 'node:readline/promises';

export interface FeedbackAnswers {
  tryingTo: string;
  whatHappened: string;
  wouldChange: string;
}

export interface FeedbackMeta {
  version: string;
  platform: string;
  node: string;
}

export interface FeedbackSubmission {
  answers: FeedbackAnswers;
  contact: string | null;
  meta: FeedbackMeta;
}

export const FEEDBACK_ENDPOINT = 'https://markwise.dev/api/feedback';
export const CLIENT_HEADER_NAME = 'x-markwise-client';
// Not a secret - just filters drive-by spam. Keep in sync with api/_lib.ts.
export const CLIENT_HEADER_VALUE = 'markwise-cli';

const NEW_ISSUE_URL = 'https://github.com/farandclose/markwise/issues/new';
const MIN_TOTAL_CHARS = 20;
const MAX_TOTAL_CHARS = 10000;
const MAX_URL_LENGTH = 7600;
const TITLE_SNIPPET = 60;

function totalLength(a: FeedbackAnswers): number {
  return a.tryingTo.trim().length + a.whatHappened.trim().length + a.wouldChange.trim().length;
}

export function validateAnswers(a: FeedbackAnswers): string | null {
  const total = totalLength(a);
  if (total === 0) return 'no answers given - nothing to send';
  if (total < MIN_TOTAL_CHARS) return 'answers are too short to act on - add a little detail';
  if (total > MAX_TOTAL_CHARS) return 'answers are too long - please trim them';
  return null;
}

export function deriveTitle(a: FeedbackAnswers): string {
  const first = a.tryingTo.trim().replace(/\s+/g, ' ');
  if (first === '') return 'CLI feedback';
  return `CLI feedback: ${first.slice(0, TITLE_SNIPPET)}`;
}

export function composeIssueMarkdown(s: FeedbackSubmission): string {
  const section = (q: string, a: string): string =>
    `### ${q}\n\n${a.trim() === '' ? '_no answer_' : a.trim()}\n`;
  return [
    section('What were you trying to do?', s.answers.tryingTo),
    section('What happened - what worked, what broke?', s.answers.whatHappened),
    section('What would you change or add first?', s.answers.wouldChange),
    '---',
    `- markwise ${s.meta.version}, ${s.meta.platform}, node ${s.meta.node}`,
    `- contact: ${s.contact ?? 'none provided'}`,
    '- via `markwise feedback`',
  ].join('\n');
}

export function buildIssueUrl(title: string, body: string): string {
  const make = (b: string): string =>
    `${NEW_ISSUE_URL}?labels=cli-feedback&title=${encodeURIComponent(title)}&body=${encodeURIComponent(b)}`;
  const full = make(body);
  if (full.length <= MAX_URL_LENGTH) return full;
  const note = '\n\n[truncated - the full text is in markwise-feedback-draft.md]';
  // Encoded length per char varies; shrink until it fits.
  let keep = body.length;
  let url = full;
  while (url.length > MAX_URL_LENGTH && keep > 0) {
    keep = Math.floor(keep * 0.8);
    url = make(body.slice(0, keep) + note);
  }
  return url;
}

export type SubmitResult =
  | { kind: 'ok'; issueNumber: number; issueUrl: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'unavailable'; message: string };

export async function submitFeedback(
  s: FeedbackSubmission,
  endpoint: string,
  fetchImpl: typeof fetch
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
      },
      body: JSON.stringify(s),
    });
  } catch {
    return { kind: 'unavailable', message: 'could not reach the feedback service' };
  }
  if (res.status === 201) {
    try {
      const data = (await res.json()) as { issueNumber?: unknown; issueUrl?: unknown };
      if (typeof data.issueNumber === 'number' && typeof data.issueUrl === 'string') {
        return { kind: 'ok', issueNumber: data.issueNumber, issueUrl: data.issueUrl };
      }
    } catch {
      // fall through to unavailable
    }
    return { kind: 'unavailable', message: 'the feedback service returned an unreadable reply' };
  }
  if (res.status === 400 || res.status === 403) {
    let message = `the feedback service rejected this (${res.status})`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === 'string') message = data.error;
    } catch {
      // keep the generic message
    }
    return { kind: 'invalid', message };
  }
  return { kind: 'unavailable', message: `feedback service error (${res.status})` };
}

export interface FeedbackCommandDeps {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  fetchImpl: typeof fetch;
  endpoint: string;
  meta: FeedbackMeta;
  openBrowser: (url: string) => void;
  writeDraft: (content: string) => string;
}

export async function runFeedbackCommand(deps: FeedbackCommandDeps): Promise<number> {
  const out = deps.output;
  const rl = createInterface({ input: deps.input, output: deps.output });
  try {
    out.write(
      'markwise feedback - three quick questions. Your answers are posted publicly as a GitHub issue.\n\n'
    );
    const tryingTo = (await rl.question('What were you trying to do?\n> ')).trim();
    const whatHappened = (await rl.question('\nWhat happened - what worked, what broke?\n> ')).trim();
    const wouldChange = (await rl.question('\nWhat would you change or add first?\n> ')).trim();
    const answers: FeedbackAnswers = { tryingTo, whatHappened, wouldChange };

    const problem = validateAnswers(answers);
    if (problem !== null) {
      out.write(`\nmarkwise feedback: ${problem}. Nothing sent.\n`);
      return 1;
    }

    const contactRaw = (
      await rl.question(
        '\nGitHub handle or email, if you are open to follow-up questions (Enter to skip)\n> '
      )
    ).trim();
    const submission: FeedbackSubmission = {
      answers,
      contact: contactRaw === '' ? null : contactRaw,
      meta: deps.meta,
    };

    out.write(
      `\nAlso sending: markwise ${deps.meta.version}, ${deps.meta.platform}, node ${deps.meta.node}.\n`
    );
    const confirm = (
      await rl.question(
        'This will be posted publicly as a GitHub issue on farandclose/markwise. Send? [Y/n] '
      )
    )
      .trim()
      .toLowerCase();
    if (confirm !== '' && confirm !== 'y' && confirm !== 'yes') {
      out.write('Nothing sent.\n');
      return 0;
    }

    const result = await submitFeedback(submission, deps.endpoint, deps.fetchImpl);
    if (result.kind === 'ok') {
      out.write(`\nThanks - your feedback is now issue #${result.issueNumber}: ${result.issueUrl}\n`);
      return 0;
    }

    const body = composeIssueMarkdown(submission);
    // Never lose the user's words. If even the draft file cannot be written
    // (e.g. an unwritable cwd), fall back to printing the composed issue so it
    // can be copied by hand.
    let draftPath: string | null = null;
    try {
      draftPath = deps.writeDraft(body);
    } catch {
      draftPath = null;
    }
    const paste = `\nCould not save a draft file, so here is your feedback - copy it into a new issue at ${NEW_ISSUE_URL}:\n\n${body}\n\n`;

    if (result.kind === 'invalid') {
      if (draftPath !== null) {
        out.write(
          `\nmarkwise feedback: ${result.message}\n` +
            `Your answers were saved to ${draftPath} - nothing was lost.\n`
        );
      } else {
        out.write(`\nmarkwise feedback: ${result.message}\n` + paste);
      }
      return 1;
    }

    const url = buildIssueUrl(deriveTitle(answers), body);
    if (draftPath !== null) {
      out.write(
        `\nmarkwise feedback: ${result.message}.\n` +
          `Your answers were saved to ${draftPath} - nothing was lost.\n` +
          `Opening GitHub with your feedback prefilled so you can submit it yourself:\n  ${url}\n`
      );
    } else {
      out.write(
        `\nmarkwise feedback: ${result.message}.\n` +
          paste +
          `Also opening GitHub with your feedback prefilled so you can submit it yourself:\n  ${url}\n`
      );
    }
    deps.openBrowser(url);
    return 1;
  } finally {
    rl.close();
  }
}
