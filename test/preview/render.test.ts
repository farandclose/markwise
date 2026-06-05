import { describe, it, expect } from 'vitest';
import { renderDocumentHtml } from '../../src/preview/render.js';

const DOC = `# Title

The product ships by <!-- mw:s1 -->Q3<!-- /mw:s1 --> next year.<!-- mw:s2 -->

The market is <!-- mw:s3 -->large<!-- /mw:s3 -->.

A code sample: \`<!-- mw:cf -->\`

<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"00000000","before":"ships by ","after":" next"},"text":"Q4","thread":[]}
{"id":"s2","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"next year.","after":""},"text":" More.","thread":[]}
{"id":"s3","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"00000000","before":"market is ","after":"."},"thread":[]}
-->
`;

// Reverse markdown-it's escapeHtml so we can compare a breadcrumb run's text to the source slice.
function unescape(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

describe('renderDocumentHtml: breadcrumbs', () => {
  it('every text run carries a source offset that slices back to its exact text', () => {
    const html = renderDocumentHtml(DOC);
    const re = /<span class="mw-run" data-s="(\d+)" data-e="(\d+)">([^<]*)<\/span>/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(html)) !== null) {
      const s = Number(m[1]);
      const e = Number(m[2]);
      expect(DOC.slice(s, e)).toBe(unescape(m[3]!));
      count++;
    }
    expect(count).toBeGreaterThan(3); // headings + paragraphs all produce runs
  });

  it('wraps the wrapped span text "Q3" in a breadcrumb whose offset is correct', () => {
    const html = renderDocumentHtml(DOC);
    const m = /data-s="(\d+)" data-e="(\d+)">Q3<\/span>/.exec(html);
    expect(m).not.toBeNull();
    expect(DOC.slice(Number(m![1]), Number(m![2]))).toBe('Q3');
  });
});

describe('renderDocumentHtml: marker highlights', () => {
  it('opens a typed highlight span for an open span note', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<span class="mw-span mw-type-replace" data-mw-id="s1">');
    expect(html).toContain('<span class="mw-span mw-type-delete" data-mw-id="s3">');
    expect(html).toContain('Q3');
  });

  it('renders an open point note as a self-closing typed span', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<span class="mw-point mw-type-insert" data-mw-id="s2"></span>');
  });

  it('drops the mw:log block and its records', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).not.toContain('mw:log');
    expect(html).not.toContain('"id":"s1"');
  });

  it('drops the mw:archive block', () => {
    const src = [
      '# T',
      '',
      'Done.',
      '',
      '<!-- mw:archive v=1',
      '{"id":"a1","type":"comment","state":"resolved","at":"2026-06-01T00:00:00Z","summary":"done"}',
      '-->',
      '',
    ].join('\n');
    expect(renderDocumentHtml(src)).not.toContain('mw:archive');
  });

  it('leaves a marker inside inline code untouched (not a highlight)', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).not.toContain('data-mw-id="cf"');
    expect(html).toContain('mw:cf'); // survives as literal (escaped) code text
  });

  it('does not highlight a resolved note that still has a marker', () => {
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
    expect(renderDocumentHtml(src)).not.toContain('data-mw-id="s1"');
  });

  it('leaves a marker with no matching open note as a literal comment', () => {
    const src = '# T\n\nHi <!-- mw:zz -->there<!-- /mw:zz -->.\n';
    const html = renderDocumentHtml(src);
    expect(html).not.toContain('data-mw-id="zz"');
  });
});
