import { describe, it, expect } from 'vitest';
import { extractNotes } from '../../src/preview/notes.js';

const DOC = `The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> next year.<!-- mw:s2 -->

The market is <!-- mw:s3 -->large and growing<!-- /mw:s3 -->.

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"9fc58f1a","before":"ships by ","after":" next"},"text":"Q4","thread":[{"by":"reviewer","at":"2026-05-24T14:00","body":"Use Q4."}]}
{"id":"s2","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"next year."},"text":" We expect strong demand.","thread":[]}
{"id":"s3","type":"delete","state":"resolved","disp":"applied","anchor":{"kind":"span","hash":"d55f3029","before":"market is ","after":"."},"thread":[{"by":"reviewer","at":"2026-05-24T14:01","body":"Cut it."}]}
-->
`;

describe('extractNotes', () => {
  it('returns one NoteView per log record', () => {
    const notes = extractNotes(DOC);
    expect(notes.map((n) => n.id)).toEqual(['s1', 's2', 's3']);
  });

  it('carries type, anchorKind, state, disp, text, and thread', () => {
    const [s1, s2] = extractNotes(DOC);
    expect(s1).toMatchObject({ id: 's1', type: 'replace', anchorKind: 'span', state: 'open', disp: 'none', text: 'Q4' });
    expect(s1.thread).toHaveLength(1);
    expect(s1.thread[0]).toMatchObject({ by: 'reviewer', body: 'Use Q4.' });
    expect(s2).toMatchObject({ id: 's2', type: 'insert', anchorKind: 'point' });
    expect(s2.text).toBe(' We expect strong demand.');
    expect(s2.thread).toEqual([]);
  });

  it('orders notes by their first marker offset (document order), not log order', () => {
    // Reverse the log lines; the rail order should still follow the prose markers.
    const reordered = DOC.replace(
      /(<!-- mw:log v=1\n)([\s\S]*?)(\n-->)/,
      (_m, open, body, close) => open + body.split('\n').reverse().join('\n') + close,
    );
    const ids = extractNotes(reordered).map((n) => n.id);
    expect(ids).toEqual(['s1', 's2', 's3']);
  });

  it('skips records that are not valid objects', () => {
    const broken = DOC.replace('{"id":"s2"', 'not-json {"id":"s2"');
    const ids = extractNotes(broken).map((n) => n.id);
    expect(ids).toEqual(['s1', 's3']);
  });
});
