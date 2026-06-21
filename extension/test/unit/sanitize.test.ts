import { describe, it, expect } from 'vitest';
import { createNote, buildDocPayload } from 'markwise';
import { sanitizeDocumentHtml } from '../../src/sanitize';

// R7: the rendered document HTML is allowlist-sanitized so author/agent markup cannot execute, while
// the previewer's highlight spans and their data-* anchors survive intact.
describe('sanitizeDocumentHtml', () => {
  it('neutralizes inline event handlers, scripts, and javascript: URLs but leaves the markup inert', () => {
    const hostile =
      '# Heading\n\n' +
      'Text with <img src="x" onerror="alert(1)"> and ' +
      '<a href="javascript:alert(2)">link</a> and ' +
      '<script>alert(3)</script> done.\n';
    const html = buildDocPayload(hostile, '/tmp/x.md').html;
    const clean = sanitizeDocumentHtml(html);

    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('alert(3)'); // script contents removed with the tag
    // Heading still renders as a heading (the document is still readable).
    expect(clean).toMatch(/<h1[^>]*>/);
  });

  it('preserves the Markwise highlight span and its data-* anchors', () => {
    // A comment on the word "quick" (offsets 13..18 in the base) produces an mw highlight span plus
    // the mw-run breadcrumb spans the selection logic reads.
    const base = '# Title\n\nThe quick brown fox.\n';
    const withNote = createNote(base, {
      kind: 'span',
      start: 13,
      end: 18,
      body: 'why this word?',
      at: '2026-01-01T00:00:00Z',
      type: 'comment',
    }).output;
    const html = buildDocPayload(withNote, '/tmp/x.md').html;
    const clean = sanitizeDocumentHtml(html);

    expect(html).toContain('data-mw-id'); // precondition: the engine emitted the span
    expect(clean).toContain('class="mw-span mw-type-comment"');
    expect(clean).toContain('data-mw-id=');
    expect(clean).toMatch(/data-s="\d+"/);
    expect(clean).toMatch(/data-e="\d+"/);
  });

  it('keeps safe links and ordinary formatting', () => {
    const md = '# T\n\nA [real link](https://example.com) and **bold** and `code`.\n';
    const clean = sanitizeDocumentHtml(buildDocPayload(md, '/tmp/x.md').html);
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('<strong>');
    expect(clean).toContain('<code>');
  });
});
