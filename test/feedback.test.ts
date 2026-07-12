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
