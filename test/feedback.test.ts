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
