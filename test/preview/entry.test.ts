import { describe, it, expect } from 'vitest';
import * as mw from '../../src/index.js';

describe('library entry point', () => {
  it('re-exports the core functions', () => {
    expect(typeof mw.parse).toBe('function');
    expect(typeof mw.lintText).toBe('function');
    expect(typeof mw.fixText).toBe('function');
    expect(typeof mw.stripText).toBe('function');
    expect(typeof mw.status).toBe('function');
  });

  it('parse returns a ParsedDoc shape', () => {
    const doc = mw.parse('hello\n');
    expect(Array.isArray(doc.blocks)).toBe(true);
    expect(Array.isArray(doc.markers)).toBe(true);
  });
});
