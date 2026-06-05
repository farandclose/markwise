import { describe, it, expect } from 'vitest';
import { buildHandoffText } from '../../src/preview/handoff.js';

describe('buildHandoffText', () => {
  it('uses a singular phrase for exactly one waiting note', () => {
    const text = buildHandoffText({ path: 'playground.md', waitingCount: 1 });
    expect(text).toContain('1 note is waiting on you');
    expect(text).not.toContain('1 notes');
  });

  it('uses a plural phrase for multiple waiting notes', () => {
    const text = buildHandoffText({ path: 'playground.md', waitingCount: 3 });
    expect(text).toContain('3 notes are waiting on you');
  });

  it('uses the plural phrase for a zero count', () => {
    const text = buildHandoffText({ path: 'playground.md', waitingCount: 0 });
    expect(text).toContain('0 notes are waiting on you');
  });

  it('interpolates the path into both the prose and the command', () => {
    const text = buildHandoffText({ path: 'docs/plan.md', waitingCount: 2 });
    expect(text).toContain('A Markwise review of `docs/plan.md` just finished.');
    expect(text).toContain('Run `markwise prompt docs/plan.md`');
  });

  it('contains no em-dash and no HTML-comment-breaking sequence', () => {
    const text = buildHandoffText({ path: 'a.md', waitingCount: 1 });
    expect(text).not.toContain('—'); // em-dash (escaped so no literal em-dash lives in the repo)
    expect(text).not.toContain('-->');
  });
});
