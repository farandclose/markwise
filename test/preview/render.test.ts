import { describe, it, expect } from 'vitest';
import { injectMarkerSpans, renderDocumentHtml } from '../../src/preview/render.js';
import { extractNotes } from '../../src/preview/notes.js';

const DOC = `# Title

The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> next year.<!-- mw:s2 -->

The market is <!-- mw:s3 -->large<!-- /mw:s3 -->.

A code sample: \`<!-- mw:cf -->\`

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"00000000","before":"ships by ","after":" next"},"text":"Q4","thread":[]}
{"id":"s2","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"next year."},"text":" More.","thread":[]}
{"id":"s3","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"00000000","before":"market is ","after":"."},"thread":[]}
-->
`;

describe('injectMarkerSpans', () => {
  it('wraps a span note in a typed span and drops the markers', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).toContain('<span class="mw-span mw-type-replace" data-mw-id="s1">Q3</span>');
    expect(out).not.toContain('<!-- mw:s1 -->');
    expect(out).not.toContain('<!-- /mw:s1 -->');
  });

  it('renders a point note as a self-closing typed span', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).toContain('<span class="mw-point mw-type-insert" data-mw-id="s2"></span>');
  });

  it('removes the mw:log block entirely', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).not.toContain('mw:log');
    expect(out).not.toContain('"id":"s1"');
  });

  it('leaves markers inside code spans/fences untouched', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).toContain('`<!-- mw:cf -->`');
  });

  it('wraps a delete span note with mw-type-delete', () => {
    const out = injectMarkerSpans(DOC, extractNotes(DOC));
    expect(out).toContain('<span class="mw-span mw-type-delete" data-mw-id="s3">large</span>');
  });

  it('leaves a marker untouched when its id has no matching note', () => {
    const out = injectMarkerSpans(DOC, []); // no notes -> every marker is an orphan
    expect(out).toContain('<!-- mw:s1 -->');
    expect(out).toContain('<!-- /mw:s1 -->');
  });
});

describe('renderDocumentHtml', () => {
  it('renders markdown with the highlight spans surviving', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<span class="mw-span mw-type-replace" data-mw-id="s1">Q3</span>');
    expect(html).toContain('data-mw-id="s2"');
    expect(html).not.toContain('mw:log');
  });

  it('does not paint a highlight for a resolved note that still has a marker', () => {
    const src = [
      '# T',
      '',
      'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
      '',
      '<!-- mw:log v=1',
      '{"id":"s1","type":"replace","state":"resolved","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"text":"Q4","thread":[]}',
      '-->',
      '',
    ].join('\n');
    const html = renderDocumentHtml(src);
    expect(html).not.toContain('data-mw-id="s1"');
  });
});
