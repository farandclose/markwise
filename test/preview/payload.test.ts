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
    expect(p.html).toContain('<h1>Quarterly Plan</h1>');
  });
});
