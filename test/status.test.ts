import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { status } from '../src/status.js';

// status implements D34's "who spoke last" turn rule. These cases pin each branch.

function logDoc(records: string[]): string {
  return `Body.<!-- mw:c1 -->\n\n<!-- mw:log v=1\n${records.join('\n')}\n-->`;
}

test('a brand-new note (reviewer opened, agent has not acted) is waiting on the agent', () => {
  const doc = logDoc([
    '{"id":"c1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"Body."},"thread":[{"by":"reviewer","at":"t","body":"why?"}]}',
  ]);
  const r = status(doc);
  expect(r.open).toBe(1);
  expect(r.waitingOnAgent.map((n) => n.id)).toEqual(['c1']);
  expect(r.waitingOnYou).toEqual([]);
  expect(r.waitingOnAgent[0]!.reason).toBe('new note');
});

test('an empty thread is treated as a new note (waiting on the agent)', () => {
  const doc = logDoc([
    '{"id":"c1","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"Body."},"text":"x","thread":[]}',
  ]);
  const r = status(doc);
  expect(r.waitingOnAgent.map((n) => n.id)).toEqual(['c1']);
});

test('agent replied last -> waiting on you', () => {
  const doc = logDoc([
    '{"id":"c1","type":"comment","state":"open","disp":"answered","anchor":{"kind":"point","before":"Body."},"thread":[{"by":"reviewer","at":"t","body":"q"},{"by":"agent","at":"t","body":"a"}]}',
  ]);
  const r = status(doc);
  expect(r.waitingOnYou.map((n) => n.id)).toEqual(['c1']);
  expect(r.waitingOnAgent).toEqual([]);
  expect(r.waitingOnYou[0]!.reason).toBe('agent answered; resolve or reply');
});

test('agent asked a question -> waiting on you and counted as needs-clarification', () => {
  const doc = logDoc([
    '{"id":"c1","type":"comment","state":"open","disp":"needs_clarification","anchor":{"kind":"point","before":"Body."},"thread":[{"by":"reviewer","at":"t","body":"do x"},{"by":"agent","at":"t","body":"x or y?"}]}',
  ]);
  const r = status(doc);
  expect(r.waitingOnYou.map((n) => n.id)).toEqual(['c1']);
  expect(r.needsClarification).toBe(1);
});

test('reviewer pushed back on top of an agent action -> waiting on the agent again', () => {
  const doc = logDoc([
    '{"id":"c1","type":"replace","state":"open","disp":"applied","anchor":{"kind":"point","before":"Body."},"text":"x","thread":[{"by":"reviewer","at":"t","body":"use Q4"},{"by":"agent","at":"t","body":"done"},{"by":"reviewer","at":"t","body":"actually H2"}]}',
  ]);
  const r = status(doc);
  expect(r.waitingOnAgent.map((n) => n.id)).toEqual(['c1']);
  expect(r.waitingOnAgent[0]!.reason).toBe('you replied; agent owes another pass');
});

test('resolved notes count as resolved and appear in neither waiting list', () => {
  const doc = `Body.

<!-- mw:archive v=1
{"id":"a1","type":"comment","state":"resolved","at":"t","summary":"clarified"}
-->`;
  const r = status(doc);
  expect(r.resolved).toBe(1);
  expect(r.open).toBe(0);
  expect(r.waitingOnYou).toEqual([]);
  expect(r.waitingOnAgent).toEqual([]);
});

test('the clean reference document is all waiting on the agent (freshly authored)', () => {
  const path = fileURLToPath(new URL('./fixtures/clean_reference.md', import.meta.url));
  const r = status(readFileSync(path, 'utf8'));
  expect(r.total).toBe(3);
  expect(r.open).toBe(3);
  expect(r.waitingOnYou).toEqual([]);
  expect(r.waitingOnAgent).toHaveLength(3);
});
