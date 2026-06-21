import { describe, it, expect, vi } from 'vitest';
import { persistDocument } from '../../src/preview/persist.js';
import { shortHash } from '../../src/hash.js';

const DOC = `# Plan

Some prose.
`;

describe('persistDocument', () => {
  it('applies the transform and returns a fresh payload when the version matches', () => {
    let written = '';
    const payload = persistDocument(
      {
        filePath: '/tmp/plan.md',
        source: DOC,
        expectedVersion: shortHash(DOC),
        write: (t) => {
          written = t;
        },
      },
      (src) => src.replace('Some prose.', 'New prose.')
    );
    expect(written).toContain('New prose.');
    expect(payload.title).toBe('Plan');
    expect(payload.version).toBe(shortHash(written));
  });

  it('throws 428 when the version precondition is missing', () => {
    expect(() =>
      persistDocument(
        { filePath: '/tmp/p.md', source: DOC, expectedVersion: undefined, write: () => {} },
        (s) => s
      )
    ).toThrowError(expect.objectContaining({ status: 428 }));
  });

  it('throws 409 when the asserted version no longer matches the source', () => {
    expect(() =>
      persistDocument(
        { filePath: '/tmp/p.md', source: DOC, expectedVersion: 'stale', write: () => {} },
        (s) => s
      )
    ).toThrowError(expect.objectContaining({ status: 409 }));
  });

  it('does not write when the version is stale', () => {
    const write = vi.fn();
    expect(() =>
      persistDocument({ filePath: '/tmp/p.md', source: DOC, expectedVersion: 'stale', write }, (s) => s + 'x')
    ).toThrow();
    expect(write).not.toHaveBeenCalled();
  });
});
