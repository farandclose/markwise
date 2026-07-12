# markwise feedback Command + Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `markwise feedback` - a three-question terminal interview that posts the answers as a public GitHub issue on farandclose/markwise via a Vercel relay function, with no GitHub account or CLI required on the user's machine.

**Architecture:** Pure, dependency-injected logic lives in `src/feedback.ts` (interview flow, validation, issue composition, submission) and `api/_lib.ts` (relay validation, rate limiting, GitHub issue creation); thin glue adapts them to the real world in `src/cli.ts` (readline over stdin, global fetch, `openBrowser`) and `api/feedback.ts` (Vercel request/response). The relay holds a bot token in a Vercel env var; the CLI never sees credentials. Spec: `docs/superpowers/specs/2026-07-12-feedback-command-and-launch-post-design.md`.

**Tech Stack:** TypeScript (strict, ESM NodeNext), vitest, Node >= 20 (global `fetch`, `node:readline/promises`), Vercel serverless function (`api/` directory, Node runtime).

## Global Constraints

- ESM with NodeNext resolution: relative imports always end in `.js` (even from `.ts` files).
- `"type": "module"`, Node >= 20. Global `fetch` is available; do not add a HTTP client dependency.
- No new runtime dependencies. Only new devDependency allowed: `@vercel/node` (types for the adapter).
- `tsconfig.json` stays untouched: it includes only `src/**/*`, so `api/` is never compiled into `dist/` or shipped to npm (`files` in package.json also excludes it). Do not add `api/` to the build.
- `vercel.json` stays untouched.
- Tests import source with `../src/<module>.js` / `../api/<module>.js` paths (vitest resolves them); tests never spawn the CLI binary.
- Repo constants used verbatim everywhere: repo `farandclose/markwise`, endpoint `https://markwise.dev/api/feedback`, env override `MARKWISE_FEEDBACK_URL`, relay env var `FEEDBACK_GITHUB_TOKEN`, header `x-markwise-client: markwise-cli`, label `cli-feedback`, draft file `markwise-feedback-draft.md`.
- Limits used verbatim: min 20 / max 10,000 total answer characters; 3 submissions per rolling hour per IP; prefilled-URL cap 7,600 characters; title snippet 60 characters.
- All user-facing copy and docs use a plain hyphen `-`, never an em-dash.
- Line endings: LF (enforced by .gitattributes); do not introduce CRLF content.
- Commit style: conventional prefixes (`feat:`, `test:`, `docs:`, `chore:`), small frequent commits. Work happens on branch `feat/feedback-command`.

---

### Task 1: Pure feedback helpers (`src/feedback.ts`)

**Files:**
- Create: `src/feedback.ts`
- Test: `test/feedback.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (used by Tasks 2-4):
  - `interface FeedbackAnswers { tryingTo: string; whatHappened: string; wouldChange: string }`
  - `interface FeedbackMeta { version: string; platform: string; node: string }`
  - `interface FeedbackSubmission { answers: FeedbackAnswers; contact: string | null; meta: FeedbackMeta }`
  - `validateAnswers(a: FeedbackAnswers): string | null` (null = valid, string = human-readable problem)
  - `deriveTitle(a: FeedbackAnswers): string`
  - `composeIssueMarkdown(s: FeedbackSubmission): string`
  - `buildIssueUrl(title: string, body: string): string`
  - `const FEEDBACK_ENDPOINT`, `const CLIENT_HEADER_NAME`, `const CLIENT_HEADER_VALUE`

- [ ] **Step 1: Write the failing tests**

Create `test/feedback.test.ts`:

```ts
import { test, expect } from 'vitest';
import {
  validateAnswers,
  deriveTitle,
  composeIssueMarkdown,
  buildIssueUrl,
  type FeedbackAnswers,
  type FeedbackSubmission,
} from '../src/feedback.js';

const answers = (over: Partial<FeedbackAnswers> = {}): FeedbackAnswers => ({
  tryingTo: 'review a plan my agent wrote',
  whatHappened: 'comments worked, suggest-edit did not',
  wouldChange: 'faster preview startup',
  ...over,
});

const submission = (over: Partial<FeedbackSubmission> = {}): FeedbackSubmission => ({
  answers: answers(),
  contact: null,
  meta: { version: '0.4.0', platform: 'darwin', node: 'v24.0.0' },
  ...over,
});

// --- validateAnswers ---

test('all answers empty is invalid', () => {
  const msg = validateAnswers(answers({ tryingTo: '', whatHappened: '', wouldChange: '' }));
  expect(msg).toMatch(/nothing to send/);
});

test('under 20 total characters is invalid', () => {
  const msg = validateAnswers(answers({ tryingTo: 'hi', whatHappened: '', wouldChange: '' }));
  expect(msg).toMatch(/too short/);
});

test('whitespace-only answers count as empty', () => {
  const msg = validateAnswers(answers({ tryingTo: '   ', whatHappened: '\t', wouldChange: '' }));
  expect(msg).toMatch(/nothing to send/);
});

test('normal answers are valid', () => {
  expect(validateAnswers(answers())).toBeNull();
});

test('over 10000 total characters is invalid', () => {
  const msg = validateAnswers(answers({ tryingTo: 'x'.repeat(10001) }));
  expect(msg).toMatch(/too long/);
});

// --- deriveTitle ---

test('title uses the first 60 chars of Q1 with whitespace collapsed', () => {
  const t = deriveTitle(answers({ tryingTo: '  review   a\nplan  ' }));
  expect(t).toBe('CLI feedback: review a plan');
});

test('title truncates at 60 characters', () => {
  const t = deriveTitle(answers({ tryingTo: 'a'.repeat(100) }));
  expect(t).toBe(`CLI feedback: ${'a'.repeat(60)}`);
});

test('title falls back when Q1 is empty', () => {
  expect(deriveTitle(answers({ tryingTo: '' }))).toBe('CLI feedback');
});

// --- composeIssueMarkdown ---

test('issue body contains all three sections and the meta line', () => {
  const body = composeIssueMarkdown(submission());
  expect(body).toContain('### What were you trying to do?');
  expect(body).toContain('review a plan my agent wrote');
  expect(body).toContain('### What happened - what worked, what broke?');
  expect(body).toContain('### What would you change or add first?');
  expect(body).toContain('markwise 0.4.0, darwin, node v24.0.0');
  expect(body).toContain('contact: none provided');
  expect(body).toContain('via `markwise feedback`');
});

test('empty answers render as "_no answer_" and contact is included when given', () => {
  const body = composeIssueMarkdown(
    submission({ answers: answers({ wouldChange: '' }), contact: '@someone' })
  );
  expect(body).toContain('_no answer_');
  expect(body).toContain('contact: @someone');
});

// --- buildIssueUrl ---

test('prefilled URL targets the new-issue page with encoded title and body', () => {
  const url = buildIssueUrl('CLI feedback: hello', '### body with spaces');
  expect(url.startsWith('https://github.com/farandclose/markwise/issues/new?')).toBe(true);
  expect(url).toContain('labels=cli-feedback');
  expect(url).toContain(encodeURIComponent('CLI feedback: hello'));
  expect(url).toContain(encodeURIComponent('### body with spaces'));
});

test('prefilled URL is capped at 7600 chars and notes the truncation', () => {
  const url = buildIssueUrl('CLI feedback', 'x'.repeat(20000));
  expect(url.length).toBeLessThanOrEqual(7600);
  expect(decodeURIComponent(url)).toContain('truncated');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/feedback.test.ts`
Expected: FAIL - cannot resolve `../src/feedback.js`.

- [ ] **Step 3: Implement `src/feedback.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/feedback.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/feedback.ts test/feedback.test.ts
git commit -m "feat: pure helpers for markwise feedback (validation, issue composition, prefilled URL)"
```

---

### Task 2: Submission client (`submitFeedback`)

**Files:**
- Modify: `src/feedback.ts` (append)
- Test: `test/feedback.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 types and constants.
- Produces (used by Task 3):
  - `type SubmitResult = { kind: 'ok'; issueNumber: number; issueUrl: string } | { kind: 'invalid'; message: string } | { kind: 'unavailable'; message: string }`
  - `submitFeedback(s: FeedbackSubmission, endpoint: string, fetchImpl: typeof fetch): Promise<SubmitResult>`
- Semantics: `invalid` = the submission itself was rejected (HTTP 400/403 - do not retry elsewhere); `unavailable` = the service could not take it (network error, 429, 5xx - fall back to the browser path).

- [ ] **Step 1: Write the failing tests**

Append to `test/feedback.test.ts`:

```ts
import { submitFeedback, CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE } from '../src/feedback.js';

function fakeFetch(status: number, json: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;
}

test('201 from the relay is an ok result with issue url and number', async () => {
  const r = await submitFeedback(
    submission(),
    'https://example.test/api/feedback',
    fakeFetch(201, { issueNumber: 42, issueUrl: 'https://github.com/farandclose/markwise/issues/42' })
  );
  expect(r).toEqual({
    kind: 'ok',
    issueNumber: 42,
    issueUrl: 'https://github.com/farandclose/markwise/issues/42',
  });
});

test('the request carries the client header and JSON body', async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const spy = (async (url: unknown, init: unknown) => {
    captured = { url: String(url), init: init as RequestInit };
    return new Response(JSON.stringify({ issueNumber: 1, issueUrl: 'u' }), { status: 201 });
  }) as unknown as typeof fetch;
  await submitFeedback(submission(), 'https://example.test/api/feedback', spy);
  expect(captured!.url).toBe('https://example.test/api/feedback');
  const headers = captured!.init.headers as Record<string, string>;
  expect(headers[CLIENT_HEADER_NAME]).toBe(CLIENT_HEADER_VALUE);
  const body = JSON.parse(String(captured!.init.body)) as { answers: { tryingTo: string } };
  expect(body.answers.tryingTo).toBe('review a plan my agent wrote');
});

test('400 maps to invalid with the server message', async () => {
  const r = await submitFeedback(submission(), 'e', fakeFetch(400, { error: 'feedback too short' }));
  expect(r).toEqual({ kind: 'invalid', message: 'feedback too short' });
});

test('429 maps to unavailable', async () => {
  const r = await submitFeedback(submission(), 'e', fakeFetch(429, { error: 'rate limit' }));
  expect(r.kind).toBe('unavailable');
});

test('a network error maps to unavailable', async () => {
  const boom = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  const r = await submitFeedback(submission(), 'e', boom);
  expect(r.kind).toBe('unavailable');
});

test('201 with an unreadable body maps to unavailable', async () => {
  const weird = (async () => new Response('not json', { status: 201 })) as unknown as typeof fetch;
  const r = await submitFeedback(submission(), 'e', weird);
  expect(r.kind).toBe('unavailable');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/feedback.test.ts`
Expected: FAIL - `submitFeedback` is not exported.

- [ ] **Step 3: Implement (append to `src/feedback.ts`)**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/feedback.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add src/feedback.ts test/feedback.test.ts
git commit -m "feat: feedback submission client with invalid/unavailable discrimination"
```

---

### Task 3: Interview flow (`runFeedbackCommand`)

**Files:**
- Modify: `src/feedback.ts` (append)
- Test: `test/feedback.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1-2 (`validateAnswers`, `composeIssueMarkdown`, `deriveTitle`, `buildIssueUrl`, `submitFeedback`).
- Produces (used by Task 4):
  - `interface FeedbackCommandDeps { input: NodeJS.ReadableStream; output: NodeJS.WritableStream; fetchImpl: typeof fetch; endpoint: string; meta: FeedbackMeta; openBrowser: (url: string) => void; writeDraft: (content: string) => string }`
  - `runFeedbackCommand(deps: FeedbackCommandDeps): Promise<number>` (exit code: 0 sent or user declined; 1 not sent - validation failure or service failure with draft saved)
- Behavior contract (from the spec): three questions -> validate -> optional contact -> meta disclosure -> public-post confirm `[Y/n]` (empty/`y`/`yes` = yes) -> submit. On `unavailable`: write draft, open prefilled browser URL. On `invalid`: write draft only. Ctrl-C is handled by the terminal, not here.

- [ ] **Step 1: Write the failing tests**

Append to `test/feedback.test.ts`:

```ts
import { PassThrough } from 'node:stream';
import { runFeedbackCommand, type FeedbackCommandDeps } from '../src/feedback.js';

interface Script {
  deps: FeedbackCommandDeps;
  written: () => string;
  drafts: string[];
  opened: string[];
}

function script(lines: string[], fetchImpl: typeof fetch): Script {
  const input = new PassThrough();
  const output = new PassThrough();
  let out = '';
  output.on('data', (c: Buffer) => {
    out += String(c);
  });
  input.end(lines.join('\n') + '\n');
  const drafts: string[] = [];
  const opened: string[] = [];
  return {
    deps: {
      input,
      output,
      fetchImpl,
      endpoint: 'https://example.test/api/feedback',
      meta: { version: '0.4.0', platform: 'darwin', node: 'v24.0.0' },
      openBrowser: (u) => opened.push(u),
      writeDraft: (content) => {
        drafts.push(content);
        return 'markwise-feedback-draft.md';
      },
    },
    written: () => out,
    drafts,
    opened,
  };
}

const okFetch = fakeFetch(201, {
  issueNumber: 7,
  issueUrl: 'https://github.com/farandclose/markwise/issues/7',
});

test('happy path: answers, skipped contact, Enter to confirm, issue link printed', async () => {
  const s = script(
    ['review a plan my agent wrote', 'comments worked great', 'faster startup', '', ''],
    okFetch
  );
  const code = await runFeedbackCommand(s.deps);
  expect(code).toBe(0);
  expect(s.written()).toContain('posted publicly');
  expect(s.written()).toContain('issue #7');
  expect(s.written()).toContain('https://github.com/farandclose/markwise/issues/7');
  expect(s.drafts).toEqual([]);
  expect(s.opened).toEqual([]);
});

test('too-short answers exit 1 without asking for contact or calling fetch', async () => {
  let fetchCalled = false;
  const spy = (async () => {
    fetchCalled = true;
    return new Response('{}', { status: 201 });
  }) as unknown as typeof fetch;
  const s = script(['hi', '', ''], spy);
  const code = await runFeedbackCommand(s.deps);
  expect(code).toBe(1);
  expect(fetchCalled).toBe(false);
  expect(s.written()).toContain('too short');
});

test('answering n at the confirm gate sends nothing and exits 0', async () => {
  let fetchCalled = false;
  const spy = (async () => {
    fetchCalled = true;
    return new Response('{}', { status: 201 });
  }) as unknown as typeof fetch;
  const s = script(
    ['review a plan my agent wrote', 'comments worked great', 'faster startup', '@me', 'n'],
    spy
  );
  const code = await runFeedbackCommand(s.deps);
  expect(code).toBe(0);
  expect(fetchCalled).toBe(false);
  expect(s.written()).toContain('Nothing sent');
});

test('service unavailable: draft saved, browser opened with prefilled issue, exit 1', async () => {
  const down = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  const s = script(
    ['review a plan my agent wrote', 'comments worked great', 'faster startup', '', 'y'],
    down
  );
  const code = await runFeedbackCommand(s.deps);
  expect(code).toBe(1);
  expect(s.drafts).toHaveLength(1);
  expect(s.drafts[0]).toContain('### What were you trying to do?');
  expect(s.opened).toHaveLength(1);
  expect(s.opened[0]).toContain('github.com/farandclose/markwise/issues/new');
  expect(s.written()).toContain('markwise-feedback-draft.md');
});

test('invalid (400) from the relay: draft saved, no browser, exit 1', async () => {
  const s = script(
    ['review a plan my agent wrote', 'comments worked great', 'faster startup', '', ''],
    fakeFetch(400, { error: 'feedback too short' })
  );
  const code = await runFeedbackCommand(s.deps);
  expect(code).toBe(1);
  expect(s.drafts).toHaveLength(1);
  expect(s.opened).toEqual([]);
  expect(s.written()).toContain('feedback too short');
});

test('contact answer is included in the submission payload', async () => {
  let payload: { contact: string | null } | null = null;
  const spy = (async (_u: unknown, init: unknown) => {
    payload = JSON.parse(String((init as RequestInit).body)) as { contact: string | null };
    return new Response(JSON.stringify({ issueNumber: 1, issueUrl: 'u' }), { status: 201 });
  }) as unknown as typeof fetch;
  const s = script(
    ['review a plan my agent wrote', 'comments worked great', 'faster startup', '@saurabh', ''],
    spy
  );
  await runFeedbackCommand(s.deps);
  expect(payload!.contact).toBe('@saurabh');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/feedback.test.ts`
Expected: FAIL - `runFeedbackCommand` is not exported.

- [ ] **Step 3: Implement (append to `src/feedback.ts`; add the readline import at the top of the file)**

At the top of `src/feedback.ts` add:

```ts
import { createInterface } from 'node:readline/promises';
```

Append:

```ts
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
    const draftPath = deps.writeDraft(body);
    if (result.kind === 'invalid') {
      out.write(
        `\nmarkwise feedback: ${result.message}\n` +
          `Your answers were saved to ${draftPath} - nothing was lost.\n`
      );
      return 1;
    }
    const url = buildIssueUrl(deriveTitle(answers), body);
    out.write(
      `\nmarkwise feedback: ${result.message}.\n` +
        `Your answers were saved to ${draftPath} - nothing was lost.\n` +
        `Opening GitHub with your feedback prefilled so you can submit it yourself:\n  ${url}\n`
    );
    deps.openBrowser(url);
    return 1;
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/feedback.test.ts`
Expected: PASS (24 tests).

> **Deviation note (2026-07-12, during execution):** the `script()` harness above
> as originally written (pre-ending the input stream with all lines) is broken:
> `node:readline/promises` drops buffered lines that arrive while no `question()`
> is pending, so the second question rejects with "readline was closed". The
> committed harness feeds one line per prompt (keyed on the `> ` / `] ` prompt
> suffixes) instead. Production code and all test assertions are unchanged from
> this plan. See `.superpowers/sdd/task-3-report.md` for the diagnosis.

- [ ] **Step 5: Run the whole suite to check for regressions**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/feedback.ts test/feedback.test.ts
git commit -m "feat: interactive feedback interview with confirm gate and draft/browser fallbacks"
```

---

### Task 4: CLI wiring (`markwise feedback`)

**Files:**
- Modify: `src/cli.ts` (USAGE block near line 16, imports near line 14, new command function near the other `*Command` functions, dispatch inside `main()` near line 402)

**Interfaces:**
- Consumes: `runFeedbackCommand`, `FEEDBACK_ENDPOINT`, `FeedbackMeta` from `src/feedback.js`; existing `openBrowser(url)` (already defined in cli.ts around line 344).
- Produces: the `markwise feedback` command. No new parseArgs flags.

- [ ] **Step 1: Add the import**

In `src/cli.ts`, alongside the other imports (`writeFileSync` must join the existing `node:fs` import):

```ts
import { readFileSync, writeFileSync, accessSync, constants } from 'node:fs';
import { runFeedbackCommand, FEEDBACK_ENDPOINT, type FeedbackMeta } from './feedback.js';
```

(Keep the existing `node:fs` names; just add `writeFileSync` if not present.)

- [ ] **Step 2: Add the usage line**

In the `USAGE` string, after the `markwise preview <file>` line, add:

```
  markwise feedback                          send feedback to the maintainer (posts a public GitHub issue)
```

- [ ] **Step 3: Add the command function**

Near the other command functions in `src/cli.ts`:

```ts
function collectFeedbackMeta(): FeedbackMeta {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { version: string };
  return { version: pkg.version, platform: process.platform, node: process.version };
}

// async so a synchronous throw (e.g. unreadable package.json in
// collectFeedbackMeta) becomes a rejection the dispatch .catch() handles,
// matching why promptWaitCommand is async. (Amended during execution: the
// original plan had a plain function here - reviewer-caught defect.)
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
```

- [ ] **Step 4: Add the dispatch**

Inside `main()`, before the unknown-command fallthrough, mirroring the `prompt --wait` async pattern:

```ts
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
```

- [ ] **Step 5: Build and smoke-test by hand**

Piped stdin delivers all lines in one chunk, and readline drops buffered lines
that arrive while no question is pending (see the Task 3 deviation note) - so
the smoke input must be paced, one line at a time:

```bash
pnpm build
node dist/cli.js --help | grep feedback   # the new usage line is present
for l in 'trying things out with markwise' 'it mostly worked fine' 'nothing yet' '' 'n'; do printf '%s\n' "$l"; sleep 0.4; done | MARKWISE_FEEDBACK_URL=http://127.0.0.1:9 node dist/cli.js feedback
```

Expected for the second command: the three questions and contact prompt echo, then `Nothing sent.` and exit code 0 (the `n` declines before any network call - the dead endpoint proves no early request happens). Also run:

```bash
for l in 'trying things out with markwise' 'it mostly worked' 'nothing' '' 'y'; do printf '%s\n' "$l"; sleep 0.4; done | MARKWISE_FEEDBACK_URL=http://127.0.0.1:9 node dist/cli.js feedback; echo "exit=$?"
ls markwise-feedback-draft.md && rm markwise-feedback-draft.md
```

Expected: unavailable message, draft saved, a github.com/farandclose/markwise/issues/new URL printed (a browser tab may open to it - harmless), `exit=1`.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts
git commit -m "feat: markwise feedback command - interview, relay submit, safe fallbacks"
```

---

### Task 5: Relay logic (`api/_lib.ts`)

**Files:**
- Create: `api/_lib.ts` (underscore prefix = not exposed as an endpoint by Vercel)
- Test: `test/relay.test.ts`

**Interfaces:**
- Consumes: nothing from `src/` (constants are intentionally duplicated with keep-in-sync comments; the npm package and the Vercel function deploy independently).
- Produces (used by Task 6):
  - `interface RelayRequest { method: string; clientHeader: string | undefined; ip: string; body: unknown }`
  - `interface RelayDeps { fetchImpl: typeof fetch; token: string; now: () => number; rateStore: Map<string, number[]> }`
  - `interface RelayResponse { status: number; body: Record<string, unknown> }`
  - `handleFeedback(req: RelayRequest, deps: RelayDeps): Promise<RelayResponse>`
  - `const CLIENT_HEADER_NAME = 'x-markwise-client'`

- [ ] **Step 1: Write the failing tests**

Create `test/relay.test.ts`:

```ts
import { test, expect } from 'vitest';
import {
  handleFeedback,
  type RelayRequest,
  type RelayDeps,
} from '../api/_lib.js';

const goodBody = {
  answers: {
    tryingTo: 'review a plan my agent wrote',
    whatHappened: 'comments worked, suggest-edit did not',
    wouldChange: 'faster preview startup',
  },
  contact: '@someone',
  meta: { version: '0.4.0', platform: 'darwin', node: 'v24.0.0' },
};

function req(over: Partial<RelayRequest> = {}): RelayRequest {
  return {
    method: 'POST',
    clientHeader: 'markwise-cli',
    ip: '1.2.3.4',
    body: goodBody,
    ...over,
  };
}

function ghOk(): { fetchImpl: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return new Response(
      JSON.stringify({ number: 42, html_url: 'https://github.com/farandclose/markwise/issues/42' }),
      { status: 201 }
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function deps(over: Partial<RelayDeps> = {}): RelayDeps {
  return {
    fetchImpl: ghOk().fetchImpl,
    token: 'tok',
    now: () => 1_000_000,
    rateStore: new Map(),
    ...over,
  };
}

test('a valid submission creates a labeled issue and returns 201', async () => {
  const gh = ghOk();
  const r = await handleFeedback(req(), deps({ fetchImpl: gh.fetchImpl }));
  expect(r.status).toBe(201);
  expect(r.body).toEqual({
    issueNumber: 42,
    issueUrl: 'https://github.com/farandclose/markwise/issues/42',
  });
  expect(gh.calls[0]!.url).toBe('https://api.github.com/repos/farandclose/markwise/issues');
  const headers = gh.calls[0]!.init.headers as Record<string, string>;
  expect(headers['authorization']).toBe('Bearer tok');
  const issue = JSON.parse(String(gh.calls[0]!.init.body)) as {
    title: string;
    body: string;
    labels: string[];
  };
  expect(issue.title).toBe('CLI feedback: review a plan my agent wrote');
  expect(issue.labels).toEqual(['cli-feedback']);
  expect(issue.body).toContain('### What were you trying to do?');
  expect(issue.body).toContain('contact: @someone');
});

test('non-POST is 405', async () => {
  const r = await handleFeedback(req({ method: 'GET' }), deps());
  expect(r.status).toBe(405);
});

test('missing or wrong client header is 403', async () => {
  expect((await handleFeedback(req({ clientHeader: undefined }), deps())).status).toBe(403);
  expect((await handleFeedback(req({ clientHeader: 'curl' }), deps())).status).toBe(403);
});

test('malformed and too-short bodies are 400', async () => {
  expect((await handleFeedback(req({ body: null }), deps())).status).toBe(400);
  expect((await handleFeedback(req({ body: 'text' }), deps())).status).toBe(400);
  const short = { ...goodBody, answers: { tryingTo: 'hi', whatHappened: '', wouldChange: '' } };
  expect((await handleFeedback(req({ body: short }), deps())).status).toBe(400);
});

test('the fourth submission from one IP inside an hour is 429', async () => {
  const d = deps();
  for (let i = 0; i < 3; i++) {
    expect((await handleFeedback(req(), d)).status).toBe(201);
  }
  expect((await handleFeedback(req(), d)).status).toBe(429);
});

test('submissions older than an hour do not count against the limit', async () => {
  let t = 1_000_000;
  const d = deps({ now: () => t });
  for (let i = 0; i < 3; i++) await handleFeedback(req(), d);
  t += 61 * 60 * 1000; // 61 minutes later
  expect((await handleFeedback(req(), d)).status).toBe(201);
});

test('different IPs have independent limits', async () => {
  const d = deps();
  for (let i = 0; i < 3; i++) await handleFeedback(req(), d);
  expect((await handleFeedback(req({ ip: '5.6.7.8' }), d)).status).toBe(201);
});

test('GitHub failure maps to 502, and a validation failure never reaches GitHub', async () => {
  const gh500 = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
  expect((await handleFeedback(req(), deps({ fetchImpl: gh500 }))).status).toBe(502);
  const boom = (async () => {
    throw new Error('down');
  }) as unknown as typeof fetch;
  expect((await handleFeedback(req(), deps({ fetchImpl: boom }))).status).toBe(502);
  let called = false;
  const spy = (async () => {
    called = true;
    return new Response('{}', { status: 201 });
  }) as unknown as typeof fetch;
  await handleFeedback(req({ body: null }), deps({ fetchImpl: spy }));
  expect(called).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/relay.test.ts`
Expected: FAIL - cannot resolve `../api/_lib.js`.

- [ ] **Step 3: Implement `api/_lib.ts`**

```ts
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
  const data = (await res.json()) as { number: number; html_url: string };
  return { status: 201, body: { issueNumber: data.number, issueUrl: data.html_url } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/relay.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify the npm build is untouched by api/**

Run: `pnpm build && ls dist | grep _lib || echo "api stays out of the build"`
Expected: build succeeds and the message prints - `dist/` contains `feedback.js` (from src) but no `_lib` file (api/ is outside tsconfig's include).

- [ ] **Step 6: Commit**

```bash
git add api/_lib.ts test/relay.test.ts
git commit -m "feat: feedback relay logic - validation, per-IP rate limit, GitHub issue creation"
```

---

### Task 6: Vercel endpoint adapter (`api/feedback.ts`)

**Files:**
- Create: `api/feedback.ts`
- Modify: `package.json` (add devDependency `@vercel/node`)

**Interfaces:**
- Consumes: `handleFeedback`, `CLIENT_HEADER_NAME`, types from `api/_lib.js`; `process.env.FEEDBACK_GITHUB_TOKEN` (set in Vercel by the maintainer - see `docs/superpowers/plans/2026-07-12-feedback-launch-human-steps.md`).
- Produces: `POST https://markwise.dev/api/feedback` once deployed. The adapter itself is thin glue verified on the Vercel preview deployment (launch checklist), not unit-tested.

- [ ] **Step 1: Add the types devDependency**

```bash
pnpm add -D @vercel/node
```

- [ ] **Step 2: Implement `api/feedback.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleFeedback, CLIENT_HEADER_NAME } from './_lib.js';

// Module scope: Fluid Compute reuses instances, so this survives across
// requests within an instance. Best-effort by design (see the spec).
const rateStore = new Map<string, number[]>();

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = process.env['FEEDBACK_GITHUB_TOKEN'];
  if (!token) {
    res.status(500).json({ error: 'relay not configured' });
    return;
  }
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    req.socket.remoteAddress ??
    'unknown';
  const header = req.headers[CLIENT_HEADER_NAME];
  const result = await handleFeedback(
    {
      method: req.method ?? 'GET',
      clientHeader: typeof header === 'string' ? header : undefined,
      ip,
      body: req.body as unknown,
    },
    { fetchImpl: fetch, token, now: () => Date.now(), rateStore }
  );
  res.status(result.status).json(result.body);
}
```

- [ ] **Step 3: Confirm the suite and build still pass**

Run: `pnpm test && pnpm build`
Expected: all tests pass; build output unchanged (no `api` files in `dist/`).

- [ ] **Step 4: Commit**

```bash
git add api/feedback.ts package.json pnpm-lock.yaml
git commit -m "feat: Vercel adapter for the feedback relay endpoint"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md` (new "Feedback" section - place it after the existing install/usage content, before any contributing/license section)
- Modify: `docs/commands.md` (new `markwise feedback` entry, matching the file's existing voice and structure)

**Interfaces:**
- Consumes: the command behavior fixed in Tasks 3-4 (copy must match actual prompts and behavior).
- Produces: user-facing docs the launch post links to.

- [ ] **Step 1: Add the README section**

```markdown
## Feedback

markwise is young and shaped by the people using it. To tell us what worked
and what did not:

```
markwise feedback
```

Three short questions, then your answers are posted as a public issue on
[farandclose/markwise](https://github.com/farandclose/markwise/issues) - no
GitHub account or login needed. Leave a handle or email if you are open to
follow-up questions; the command prints the issue link so you can subscribe
to it too. Prefer to write directly? [Open an issue](https://github.com/farandclose/markwise/issues/new)
any time.
```

(Adjust the fenced-block nesting to the README's existing style - the inner
command block uses plain triple backticks.)

- [ ] **Step 2: Add the docs/commands.md entry**

Read the file's existing per-command sections first and mirror their format
(heading level, ordering, tone). Content to convey:

```markdown
## markwise feedback

Send feedback about markwise itself to the maintainers. Asks three short
questions in the terminal (what you were trying to do, what happened, what
you would change), plus an optional contact handle, then posts the answers
as a public GitHub issue on farandclose/markwise via the markwise.dev relay -
no GitHub account or CLI required.

- Nothing is sent without an explicit confirmation step, and the text is
  clearly marked as becoming public.
- If the relay is unreachable, the answers are saved to
  `markwise-feedback-draft.md` and a prefilled GitHub new-issue page is
  opened so nothing is lost.
- `MARKWISE_FEEDBACK_URL` overrides the relay endpoint (testing).
```

- [ ] **Step 3: Verify docs contain no em-dashes**

Run: `grep -n $'—' README.md docs/commands.md || echo clean`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/commands.md
git commit -m "docs: document markwise feedback command"
```

---

### Task 8: Version bump + final verification

**Files:**
- Modify: `package.json` (version `0.3.0` -> `0.4.0`)

**Interfaces:**
- Consumes: everything above.
- Produces: a branch ready for PR. The tag push (`v0.4.0`) after merge is the maintainer's step, per RELEASING.md - never push tags from this plan.

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.3.0"` to `"version": "0.4.0"`.

- [ ] **Step 2: Full verification**

```bash
pnpm test
pnpm build
node dist/cli.js feedback </dev/null; echo "exit=$?"
```

Expected: suite green; build clean; the last command terminates promptly when stdin closes - it must not hang and must not print a stack trace (any clean exit code is acceptable for this degenerate input).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.4.0 for the feedback command"
```

---

## Post-plan launch steps (not part of the build; from the spec's sequencing)

1. Maintainer human steps: bot account, token, Vercel env var, label - see `docs/superpowers/plans/2026-07-12-feedback-launch-human-steps.md`.
2. Open a PR from `feat/feedback-command`; the Vercel preview deployment exposes the relay for end-to-end testing with `MARKWISE_FEEDBACK_URL=https://<preview-url>/api/feedback markwise feedback` (requires the preview env var). File one real issue, close it.
3. Merge, maintainer pushes `v0.4.0` tag, OIDC publishes to npm.
4. README/site/post follow per the spec's launch checklist.
