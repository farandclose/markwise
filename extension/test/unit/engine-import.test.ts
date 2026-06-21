import { describe, it, expect } from 'vitest';
import { buildDocPayload } from 'markwise';

// U2 scaffold check: the engine is reachable through the `markwise` alias (the same alias the
// esbuild bundle uses) and renders a real payload headless. This proves the import wiring the whole
// extension depends on, before any vscode glue exists.
describe('engine import via the markwise alias', () => {
  it('renders a formatted payload from the bundled engine surface', () => {
    const payload = buildDocPayload('# Hello\n\nWorld\n', '/tmp/x.md');
    expect(payload.title).toBe('Hello');
    expect(payload.html).toContain('<h1');
    expect(payload.html).not.toContain('# Hello');
    expect(payload.openCount).toBe(0);
  });
});
