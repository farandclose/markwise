import { describe, it, expect } from 'vitest';
import { buildDocPayload } from '../../src/preview/payload.js';

const DOC = `# Quarterly Plan

Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.<!-- mw:s2 -->

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}
{"id":"s2","type":"insert","state":"resolved","disp":"applied","anchor":{"kind":"point","before":"."},"text":"x","thread":[]}
-->
`;

describe('buildDocPayload', () => {
  it('uses the first H1 as the title', () => {
    const p = buildDocPayload(DOC, '/tmp/plan.md');
    expect(p.title).toBe('Quarterly Plan');
  });

  it('falls back to the file basename when there is no H1', () => {
    const p = buildDocPayload('Just prose.\n', '/tmp/notes.md');
    expect(p.title).toBe('notes.md');
  });

  it('includes only OPEN notes and counts them', () => {
    const p = buildDocPayload(DOC, '/tmp/plan.md');
    expect(p.notes.map((n) => n.id)).toEqual(['s1']);
    expect(p.openCount).toBe(1);
  });

  it('includes rendered html with the highlight span', () => {
    const p = buildDocPayload(DOC, '/tmp/plan.md');
    expect(p.html).toContain('data-mw-id="s1"');
    expect(p.html).toContain('Quarterly Plan');
  });

  it('surfaces a handoff ticket sized to the notes waiting on the agent', () => {
    const p = buildDocPayload(DOC, '/tmp/plan.md');
    expect(p.handoff.path).toBe('/tmp/plan.md');
    expect(p.handoff.waitingCount).toBe(1); // s1 is a new note (agent's turn); s2 is resolved
    expect(p.handoff.text).toContain('1 note is waiting on you');
    expect(p.handoff.text).toContain('markwise prompt /tmp/plan.md');
  });

  it('reports a zero waiting count for a document with no notes', () => {
    const p = buildDocPayload('Just prose.\n', '/tmp/notes.md');
    expect(p.handoff.waitingCount).toBe(0);
    expect(p.handoff.text).toContain('0 notes are waiting on you');
  });
});
