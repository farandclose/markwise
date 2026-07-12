// Everything testable about `markwise feedback` lives here; src/cli.ts only
// wires in the real stdin/stdout, fetch, and browser.

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
