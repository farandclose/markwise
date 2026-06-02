import { describe, it, expect } from 'vitest';
import { appendReply, NoteMutationError } from '../../src/preview/mutate.js';

const DOC = [
  '# Demo',
  '',
  'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
  '',
  '<!-- mw:log v=1',
  '{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"Suggest Q4."}]}',
  '-->',
  '',
].join('\n');

describe('appendReply', () => {
  it('appends a reviewer message to the note thread', () => {
    const out = appendReply(DOC, 's1', 'Agreed, use Q4.', '2026-06-02T12:00:00Z');
    const recLine = out.split('\n').find((l) => l.trim().startsWith('{"id":"s1"'))!;
    const rec = JSON.parse(recLine);
    expect(rec.thread).toHaveLength(2);
    expect(rec.thread[1]).toEqual({ by: 'reviewer', at: '2026-06-02T12:00:00Z', body: 'Agreed, use Q4.' });
  });

  it('trims the body and rejects an empty reply', () => {
    expect(() => appendReply(DOC, 's1', '   ', '2026-06-02T12:00:00Z')).toThrow(NoteMutationError);
  });

  it('trims surrounding whitespace from the stored body', () => {
    const out = appendReply(DOC, 's1', '  ok  ', '2026-06-02T12:00:00Z');
    const rec = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{"id":"s1"'))!);
    expect(rec.thread[rec.thread.length - 1].body).toBe('ok');
  });

  it('creates a thread when the record has none', () => {
    const NO_THREAD = [
      '# Demo',
      '',
      'Done.<!-- mw:p1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""}}',
      '-->',
      '',
    ].join('\n');
    const out = appendReply(NO_THREAD, 'p1', 'first reply', '2026-06-02T12:00:00Z');
    const rec = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{"id":"p1"'))!);
    expect(rec.thread).toHaveLength(1);
    expect(rec.thread[0]).toEqual({ by: 'reviewer', at: '2026-06-02T12:00:00Z', body: 'first reply' });
  });

  it('rejects an unknown note id with a 404 status', () => {
    try {
      appendReply(DOC, 'nope', 'hi', '2026-06-02T12:00:00Z');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NoteMutationError);
      expect((e as NoteMutationError).status).toBe(404);
    }
  });

  it('leaves prose and other lines untouched', () => {
    const out = appendReply(DOC, 's1', 'ok', '2026-06-02T12:00:00Z');
    expect(out).toContain('Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.');
  });
});
