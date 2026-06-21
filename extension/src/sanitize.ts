import sanitizeHtml from 'sanitize-html';

// Allowlist sanitizer for the engine-rendered document HTML (KTD6, R7). The engine renders markdown
// with raw-HTML passthrough (markdown-it `html: true`), so author/agent markup reaches the output
// verbatim - including anything that could execute. Before that HTML crosses into the webview we run
// it through this allowlist: <script>, <style>, <iframe>, inline event handlers (onerror, onclick,
// ...), and javascript: URLs are all removed, while the structure the previewer depends on is kept:
// the Markwise highlight spans and their data-* anchors (data-mw-id / data-s / data-e, which the
// comment-pill selection logic reads), and ordinary prose formatting. This runs host-side, before
// postMessage, so untrusted markup never reaches the live DOM (defense before the trust boundary).

// Attributes the previewer's spans carry: class drives the highlight type styling; data-mw-id ties a
// span to its note; data-s/data-e are the source-offset breadcrumbs the selection-to-note mapping uses.
const MW_SPAN_ATTRS = ['class', 'data-mw-id', 'data-s', 'data-e'];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'em', 'strong', 'b', 'i', 's', 'del', 'ins', 'sup', 'sub', 'mark', 'small',
    'a', 'code', 'pre', 'kbd', 'samp', 'var',
    'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'span', 'div', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title'],
    span: MW_SPAN_ATTRS,
    div: ['class'],
    code: ['class'], // markdown-it tags fenced code as class="language-xxx"
    pre: ['class'],
    ol: ['start'],
    th: ['align', 'colspan', 'rowspan', 'scope'],
    td: ['align', 'colspan', 'rowspan'],
  },
  // No javascript:/vbscript:/data: in links; images may use data: (inline images) but the webview CSP
  // is the real backstop on what actually loads.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  disallowedTagsMode: 'discard',
};

/** Sanitize the engine-rendered document HTML for safe display in the webview (R7). */
export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
