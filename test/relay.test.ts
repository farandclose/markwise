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

test('an unreadable GitHub 201 reply maps to 502', async () => {
  const gh = (async () => new Response('not json', { status: 201 })) as unknown as typeof fetch;
  const r = await handleFeedback(req(), deps({ fetchImpl: gh }));
  expect(r.status).toBe(502);
  expect(r.body).toEqual({ error: 'GitHub returned an unreadable reply' });
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
