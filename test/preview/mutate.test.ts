import { describe, it, expect } from 'vitest';
import { appendReply, resolveNote, createNote, NoteMutationError } from '../../src/preview/mutate.js';

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

describe('resolveNote', () => {
  const SPAN = [
    '# Demo',
    '',
    'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
    '',
    'Keep.<!-- mw:p2 -->',
    '',
    '<!-- mw:log v=1',
    '{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"Change Q3 to Q4 for accuracy."}]}',
    '{"id":"p2","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"Keep this one."}]}',
    '-->',
    '',
  ].join('\n');

  it('strips a span note\'s markers and moves the record to a new mw:archive block', () => {
    const out = resolveNote(SPAN, 's1', '2026-06-02T12:00:00Z');
    // Markers gone, wrapped text remains as plain prose.
    expect(out).toContain('Ships by Q3.');
    expect(out).not.toContain('mw:s1');
    // s1 is no longer an OPEN log record (its proposed text is gone from the file; the archive
    // record carries no `text` field, so this substring uniquely identifies the removed log line).
    expect(out).not.toContain('"text":"Q4"');
    // An archive block now holds the resolved record with an auto summary.
    expect(out).toContain('<!-- mw:archive v=1');
    const arcLine = out.split('\n').find((l) => l.trim().startsWith('{"id":"s1"'))!;
    const arc = JSON.parse(arcLine);
    expect(arc).toEqual({
      id: 's1',
      type: 'replace',
      state: 'resolved',
      at: '2026-06-02T12:00:00Z',
      summary: 'Change Q3 to Q4 for accuracy.',
    });
    // The untouched note p2 is still an open log record.
    expect(out).toContain('"id":"p2"');
    expect(out).toContain('mw:p2');
  });

  it('strips a point note\'s single marker', () => {
    const POINT = [
      '# Demo',
      '',
      'Done.<!-- mw:p1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"reviewer","at":"2026-06-01T10:00:00Z","body":"Add a closing line."}]}',
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(POINT, 'p1', '2026-06-02T12:00:00Z');
    expect(out).toContain('Done.');
    expect(out).not.toContain('mw:p1');
    expect(out).toContain('<!-- mw:archive v=1');
  });

  it('appends to an existing archive block instead of creating a second one', () => {
    const WITH_ARCHIVE = [
      '# Demo',
      '',
      'Done.<!-- mw:p1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"reviewer","at":"2026-06-01T10:00:00Z","body":"Tighten this."}]}',
      '-->',
      '',
      '<!-- mw:archive v=1',
      '{"id":"old","type":"comment","state":"resolved","at":"2026-05-01T00:00:00Z","summary":"earlier note"}',
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(WITH_ARCHIVE, 'p1', '2026-06-02T12:00:00Z');
    expect(out.match(/<!-- mw:archive v=1/g)).toHaveLength(1);
    expect(out).toContain('"id":"old"');
    expect(out).toContain('"id":"p1"');
  });

  it('truncates a long summary to one line of 80 chars', () => {
    const longBody = 'x'.repeat(200);
    const LONG = [
      'A.<!-- mw:p1 -->',
      '<!-- mw:log v=1',
      `{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"${longBody}"}]}`,
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(LONG, 'p1', '2026-06-02T12:00:00Z');
    const arc = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{"id":"p1"'))!);
    expect(arc.summary.length).toBeLessThanOrEqual(80);
    expect(arc.summary.endsWith('…')).toBe(true);
  });

  it('rejects resolving a note that is already resolved', () => {
    const RESOLVED = [
      'A.<!-- mw:p1 -->',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"resolved","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[]}',
      '-->',
      '',
    ].join('\n');
    try {
      resolveNote(RESOLVED, 'p1', '2026-06-02T12:00:00Z');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NoteMutationError);
      expect((e as NoteMutationError).status).toBe(409);
    }
  });

  it('drops the whole log block when the last open note is resolved', () => {
    const ONLY = [
      'A.<!-- mw:p1 -->',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"note"}]}',
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(ONLY, 'p1', '2026-06-02T12:00:00Z');
    expect(out).not.toContain('mw:log');
    expect(out).toContain('<!-- mw:archive v=1');
  });

  it('falls back to a generic summary when the note has no thread messages', () => {
    const EMPTY = [
      'A.<!-- mw:p1 -->',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[]}',
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(EMPTY, 'p1', '2026-06-02T12:00:00Z');
    const arc = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{"id":"p1"'))!);
    expect(arc.summary).toBe('Resolved');
  });

  it('strips a span note whose markers are on different lines', () => {
    const MULTILINE = [
      '# Demo',
      '',
      'Start <!-- mw:s9 -->first line',
      'second line<!-- /mw:s9 --> end.',
      '',
      '<!-- mw:log v=1',
      '{"id":"s9","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"Start ","after":" end"},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"check this span"}]}',
      '-->',
      '',
    ].join('\n');
    const out = resolveNote(MULTILINE, 's9', '2026-06-02T12:00:00Z');
    expect(out).not.toContain('mw:s9');
    expect(out).toContain('first line');
    expect(out).toContain('second line');
    expect(out).toContain('<!-- mw:archive v=1');
  });
});

const FRESH = [
  '# Demo',
  '',
  'Our wedge is teams.<!-- mw:n1 --> More text in plain text here.',
  '',
  '<!-- mw:log v=1',
  '{"id":"n1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":"teams.","after":" More t"},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"hi"}]}',
  '-->',
  '',
].join('\n');

describe('createNote', () => {
  const at = '2026-06-04T00:00:00Z';

  it('wraps a word as a span comment with a correct anchor', () => {
    const wStart = FRESH.indexOf('wedge');
    const { output, id } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: 'why?', at });
    expect(id).toBe('n2'); // n1 taken
    expect(output).toContain(`<!-- mw:n2 -->wedge<!-- /mw:n2 -->`);
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith('{"id":"n2"'))!);
    expect(rec.type).toBe('comment');
    expect(rec.state).toBe('open');
    expect(rec.anchor.kind).toBe('span');
    expect(typeof rec.anchor.hash).toBe('string');
    expect(rec.anchor.before.endsWith('Our ')).toBe(true);
    expect(rec.anchor.after.startsWith(' is ')).toBe(true);
    expect(rec.thread).toEqual([{ by: 'reviewer', at, body: 'why?' }]);
  });

  it('inserts a point comment (no hash) at a gap', () => {
    const gap = FRESH.indexOf('plain text') + 'plain'.length; // between "plain" and "text"
    const { output, id } = createNote(FRESH, { kind: 'point', start: gap, body: 'add a unit', at });
    expect(output).toContain(`plain<!-- mw:${id} -->`);
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.anchor.kind).toBe('point');
    expect(rec.anchor.hash).toBeUndefined();
  });

  it('the created record is self-correct: fixText changes nothing and it lints clean', async () => {
    const { fixText } = await import('../../src/fix.js');
    const { lintText } = await import('../../src/lint.js');
    const wStart = FRESH.indexOf('wedge');
    const { output } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: 'why?', at });
    expect(fixText(output).changes).toEqual([]);
    expect(lintText(output).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('mints the smallest unused nN across log and archive', () => {
    const withArchive = FRESH.replace(
      '-->\n',
      '-->\n\n<!-- mw:archive v=1\n{"id":"n2","type":"comment","state":"resolved","at":"x","summary":"s"}\n-->\n'
    );
    const wStart = withArchive.indexOf('wedge');
    const { id } = createNote(withArchive, { kind: 'span', start: wStart, end: wStart + 5, body: 'q', at });
    expect(id).toBe('n3'); // n1 (log) and n2 (archive) both taken
  });

  it('creates the mw:log block when the document has none', () => {
    const noLog = '# Demo\n\nOur wedge is here.\n';
    const wStart = noLog.indexOf('wedge');
    const { output, id } = createNote(noLog, { kind: 'span', start: wStart, end: wStart + 5, body: 'q', at });
    expect(id).toBe('n1');
    expect(output).toContain('<!-- mw:log v=1');
    expect(output).toContain(`<!-- mw:n1 -->wedge<!-- /mw:n1 -->`);
  });

  it('rejects an empty body and an out-of-range selection', () => {
    expect(() => createNote(FRESH, { kind: 'point', start: 5, body: '   ', at })).toThrow(NoteMutationError);
    expect(() => createNote(FRESH, { kind: 'point', start: 10_000, body: 'x', at })).toThrow(NoteMutationError);
    expect(() => createNote(FRESH, { kind: 'span', start: 5, end: 5, body: 'x', at })).toThrow(NoteMutationError);
  });
});
