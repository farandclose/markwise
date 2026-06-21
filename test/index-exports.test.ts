import { describe, it, expect } from 'vitest';
import * as mw from '../src/index.js';

// U1 widens the public surface for the VS Code extension (DECISIONS D40). These guard that the
// previewer engine functions are importable from the package entry, and that the existing core
// exports stay stable (R10).
describe('public library surface', () => {
  it('exposes the previewer engine functions the extension imports', () => {
    for (const name of [
      'buildDocPayload',
      'createNote',
      'appendReply',
      'resolveNote',
      'discardNote',
      'persistDocument',
      'buildHandoffText',
      'NoteMutationError',
      'readDocument',
      'writeDocument',
      'detectEol',
      'toLf',
      'applyEol',
      'buildPromptOutput',
    ]) {
      expect(typeof (mw as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('keeps the existing core exports stable', () => {
    for (const name of ['parse', 'lintText', 'fixText', 'stripText', 'status', 'shortHash']) {
      expect(typeof (mw as Record<string, unknown>)[name]).toBe('function');
    }
  });
});
