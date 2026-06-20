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

  it('renders a committed insert with its proposed text inside the point span', () => {
    const html = renderDocumentHtml(DOC);
    expect(html).toContain('<span class="mw-point mw-type-insert" data-mw-id="s2"> More.</span>');
  });

  it('renders a point comment as an empty point span (no inserted text)', () => {
    const src = [
      '# T',
      '',
      'Done.<!-- mw:p1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"agent","at":"2026-06-01T10:00:00Z","body":"hi"}]}',
      '-->',
      '',
    ].join('\n');
    expect(renderDocumentHtml(src)).toContain('<span class="mw-point mw-type-comment" data-mw-id="p1"></span>');
  });

  it('HTML-escapes the inserted text', () => {
    const src = [
      '# T',
      '',
      'Use it.<!-- mw:i1 -->',
      '',
      '<!-- mw:log v=1',
      '{"id":"i1","type":"insert","state":"open","disp":"none","anchor":{"kind":"point","before":"it.","after":""},"text":" a < b & c","thread":[]}',
      '-->',
      '',
    ].join('\n');
    const html = renderDocumentHtml(src);
    expect(html).toContain('<span class="mw-point mw-type-insert" data-mw-id="i1"> a &lt; b &amp; c</span>');
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

// Regression: a note that anchors a whole paragraph puts its opening marker at the
// start of the line. CommonMark then parses the line as an HTML comment block, so the
// marker never became a span and the prose lost its breadcrumbs (no highlight, no pill).
describe('renderDocumentHtml: a marker that opens a paragraph', () => {
  const SRC = [
    '# T',
    '',
    '## Design Partnerships',
    '',
    '<!-- mw:p1 -->We are running design partnerships to prove value.<!-- /mw:p1 -->',
    '',
    '## Pricing',
    '',
    'Flat fee.',
    '',
    '<!-- mw:log v=1',
    '{"id":"p1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"s\\n\\n","after":"\\n\\n##"},"thread":[]}',
    '-->',
    '',
  ].join('\n');

  it('opens a highlight span for a note whose marker starts the paragraph', () => {
    expect(renderDocumentHtml(SRC)).toContain('<span class="mw-span mw-type-comment" data-mw-id="p1">');
  });

  it('does not leak the literal markers into the output', () => {
    const html = renderDocumentHtml(SRC);
    expect(html).not.toContain('<!-- mw:p1 -->');
    expect(html).not.toContain('<!-- /mw:p1 -->');
  });

  it('still emits breadcrumb runs for the paragraph prose (so the pill can attach)', () => {
    const html = renderDocumentHtml(SRC);
    const m = /<span class="mw-run" data-s="(\d+)" data-e="(\d+)">([^<]*partnerships[^<]*)<\/span>/.exec(html);
    expect(m).not.toBeNull();
    expect(SRC.slice(Number(m![1]), Number(m![2]))).toBe(unescape(m![3]!));
  });
});

describe('renderDocumentHtml: committed replace shows its replacement inline', () => {
  it('emits the replacement as a sibling span right after the struck original', () => {
    const html = renderDocumentHtml(DOC);
    // s1 wraps "Q3" and proposes "Q4": the original span closes, then the replacement span follows.
    expect(html).toContain('</span><span class="mw-replace-text" data-mw-id="s1">Q4</span>');
  });

  it('emits a replacement span only for replace notes (not delete or insert)', () => {
    const html = renderDocumentHtml(DOC);
    const count = (html.match(/class="mw-replace-text"/g) || []).length;
    expect(count).toBe(1); // only s1 (replace); s2 (insert) and s3 (delete) get none
    expect(html).not.toContain('mw-replace-text" data-mw-id="s3"'); // delete close stays a plain </span>
  });

  it('HTML-escapes the replacement text', () => {
    const src = [
      '# T',
      '',
      'Use <!-- mw:r1 -->X<!-- /mw:r1 -->.',
      '',
      '<!-- mw:log v=1',
      '{"id":"r1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"Use ","after":"."},"text":"a < b & c","thread":[]}',
      '-->',
      '',
    ].join('\n');
    const html = renderDocumentHtml(src);
    expect(html).toContain('<span class="mw-replace-text" data-mw-id="r1">a &lt; b &amp; c</span>');
  });

  it('does not emit a replacement span for a resolved replace (not open)', () => {
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
    expect(renderDocumentHtml(src)).not.toContain('mw-replace-text');
  });
});

// A note whose range crosses a paragraph boundary must light every paragraph it covers. An inline
// <span> cannot legally cross a <p>, so the highlight is closed at each block end and reopened at the
// next block start - one valid span per block (2A, 2026-06-20-cross-block-comment).
describe('renderDocumentHtml: a span note that crosses a block boundary', () => {
  const XSRC = [
    '# T',
    '',
    'First paragraph <!-- mw:x1 -->starts here.',
    '',
    'And ends <!-- /mw:x1 --> in the second paragraph.',
    '',
    '<!-- mw:log v=1',
    '{"id":"x1","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"graph ","after":" in"},"thread":[]}',
    '-->',
    '',
  ].join('\n');

  it('highlights both paragraphs the note spans (not just the first)', () => {
    const html = renderDocumentHtml(XSRC);
    const ps = html.match(/<p>[\s\S]*?<\/p>/g) ?? [];
    expect(ps.length).toBe(2);
    expect(ps[0]).toContain('data-mw-id="x1"');
    expect(ps[1]).toContain('data-mw-id="x1"'); // the para that used to render unhighlighted
  });

  it('keeps every block self-balanced (no span crosses a </p>)', () => {
    const html = renderDocumentHtml(XSRC);
    const ps = html.match(/<p>[\s\S]*?<\/p>/g) ?? [];
    for (const p of ps) {
      const opens = (p.match(/<span/g) ?? []).length;
      const closes = (p.match(/<\/span>/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it('does not leak the literal markers', () => {
    const html = renderDocumentHtml(XSRC);
    expect(html).not.toContain('<!-- mw:x1 -->');
    expect(html).not.toContain('<!-- /mw:x1 -->');
  });
});
