// Relay logic for the markwise feedback endpoint, framework-free so vitest can
// exercise it directly. api/feedback.ts adapts it to Vercel's (req, res).
// Vercel does not expose underscore-prefixed files in api/ as endpoints.

export const CLIENT_HEADER_NAME = 'x-markwise-client';
// Not a secret - just filters drive-by spam. Keep in sync with src/feedback.ts.
const CLIENT_HEADER_VALUE = 'markwise-cli';
const REPO = 'farandclose/markwise';
const MIN_TOTAL_CHARS = 20;
const MAX_TOTAL_CHARS = 10000;
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const TITLE_SNIPPET = 60;

export interface RelayRequest {
  method: string;
  clientHeader: string | undefined;
  ip: string;
  body: unknown;
}

export interface RelayDeps {
  fetchImpl: typeof fetch;
  token: string;
  now: () => number;
  rateStore: Map<string, number[]>;
}

export interface RelayResponse {
  status: number;
  body: Record<string, unknown>;
}

interface ParsedSubmission {
  answers: { tryingTo: string; whatHappened: string; wouldChange: string };
  contact: string | null;
  meta: { version: string; platform: string; node: string };
}

function asTrimmedString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function parseSubmission(
  body: unknown
): { ok: true; sub: ParsedSubmission } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, message: 'malformed payload' };
  const b = body as Record<string, unknown>;
  const rawAnswers = (
    typeof b['answers'] === 'object' && b['answers'] !== null ? b['answers'] : {}
  ) as Record<string, unknown>;
  const answers = {
    tryingTo: asTrimmedString(rawAnswers['tryingTo'], MAX_TOTAL_CHARS),
    whatHappened: asTrimmedString(rawAnswers['whatHappened'], MAX_TOTAL_CHARS),
    wouldChange: asTrimmedString(rawAnswers['wouldChange'], MAX_TOTAL_CHARS),
  };
  const total = answers.tryingTo.length + answers.whatHappened.length + answers.wouldChange.length;
  if (total < MIN_TOTAL_CHARS) return { ok: false, message: 'feedback too short' };
  if (total > MAX_TOTAL_CHARS) return { ok: false, message: 'feedback too long' };
  const contact = asTrimmedString(b['contact'], 200);
  const rawMeta = (typeof b['meta'] === 'object' && b['meta'] !== null ? b['meta'] : {}) as Record<
    string,
    unknown
  >;
  return {
    ok: true,
    sub: {
      answers,
      contact: contact === '' ? null : contact,
      meta: {
        version: asTrimmedString(rawMeta['version'], 40),
        platform: asTrimmedString(rawMeta['platform'], 40),
        node: asTrimmedString(rawMeta['node'], 40),
      },
    },
  };
}

function allowedByRateLimit(ip: string, deps: Pick<RelayDeps, 'now' | 'rateStore'>): boolean {
  const now = deps.now();
  const fresh = (deps.rateStore.get(ip) ?? []).filter((t) => t > now - RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT) {
    deps.rateStore.set(ip, fresh);
    return false;
  }
  fresh.push(now);
  deps.rateStore.set(ip, fresh);
  return true;
}

function buildIssue(sub: ParsedSubmission): { title: string; body: string; labels: string[] } {
  const first = sub.answers.tryingTo.replace(/\s+/g, ' ');
  const title = first === '' ? 'CLI feedback' : `CLI feedback: ${first.slice(0, TITLE_SNIPPET)}`;
  const section = (q: string, a: string): string => `### ${q}\n\n${a === '' ? '_no answer_' : a}\n`;
  const body = [
    section('What were you trying to do?', sub.answers.tryingTo),
    section('What happened - what worked, what broke?', sub.answers.whatHappened),
    section('What would you change or add first?', sub.answers.wouldChange),
    '---',
    `- markwise ${sub.meta.version || 'unknown'}, ${sub.meta.platform || 'unknown'}, node ${sub.meta.node || 'unknown'}`,
    `- contact: ${sub.contact ?? 'none provided'}`,
    '- via `markwise feedback`',
  ].join('\n');
  return { title, body, labels: ['cli-feedback'] };
}

export async function handleFeedback(req: RelayRequest, deps: RelayDeps): Promise<RelayResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'POST only' } };
  if (req.clientHeader !== CLIENT_HEADER_VALUE) {
    return { status: 403, body: { error: 'unrecognized client' } };
  }
  const parsed = parseSubmission(req.body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.message } };
  if (!allowedByRateLimit(req.ip, deps)) {
    return { status: 429, body: { error: 'rate limit: 3 submissions per hour' } };
  }
  const issue = buildIssue(parsed.sub);
  let res: Response;
  try {
    res = await deps.fetchImpl(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${deps.token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'markwise-feedback-relay',
      },
      body: JSON.stringify(issue),
    });
  } catch {
    return { status: 502, body: { error: 'could not reach GitHub' } };
  }
  if (res.status !== 201) {
    return { status: 502, body: { error: `GitHub rejected the issue (${res.status})` } };
  }
  try {
    const data = (await res.json()) as { number?: unknown; html_url?: unknown };
    if (typeof data.number === 'number' && typeof data.html_url === 'string') {
      return { status: 201, body: { issueNumber: data.number, issueUrl: data.html_url } };
    }
  } catch {
    // fall through to the 502 below
  }
  return { status: 502, body: { error: 'GitHub returned an unreadable reply' } };
}
