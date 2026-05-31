import { test, expect } from 'vitest';
import { buildPromptOutput } from '../src/prompt.js';

const template = 'Act now. Sign every message at <CURRENT_TIME>. Use <CURRENT_TIME> for `at`.';

test('substitutes every <CURRENT_TIME> and appends the document', () => {
  const out = buildPromptOutput({
    template,
    document: '# Spec\n\nBody text.',
    now: '2026-05-31T10:00:00Z',
  });
  expect(out).not.toContain('<CURRENT_TIME>');
  expect(out.match(/2026-05-31T10:00:00Z/g)).toHaveLength(2);
  expect(out).toContain('# Spec');
  expect(out).toContain('---'); // document separator
});

test('lists the notes waiting on the agent when provided', () => {
  const out = buildPromptOutput({
    template,
    document: 'doc',
    now: 'T',
    waitingOnAgent: [
      { id: 's1', type: 'replace' },
      { id: 's3', type: 'comment' },
    ],
  });
  expect(out).toContain('Notes waiting on you right now');
  expect(out).toContain('- s1 (replace)');
  expect(out).toContain('- s3 (comment)');
});

test('omits the waiting-list section when there is nothing waiting', () => {
  const out = buildPromptOutput({ template, document: 'doc', now: 'T', waitingOnAgent: [] });
  expect(out).not.toContain('Notes waiting on you right now');
});
