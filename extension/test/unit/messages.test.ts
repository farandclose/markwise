import { describe, it, expect } from 'vitest';
import { parseInboundMessage } from '../../src/messages';

// The bridge validation (KTD6, R7): only well-formed `apiRequest` envelopes with typed fields pass;
// everything else is rejected before it can reach a mutate call.
describe('parseInboundMessage', () => {
  it('accepts a well-formed GET request', () => {
    const msg = parseInboundMessage({ type: 'apiRequest', id: 1, method: 'GET', url: '/api/doc' });
    expect(msg).toEqual({
      type: 'apiRequest',
      id: 1,
      method: 'GET',
      url: '/api/doc',
      version: undefined,
      handoff: false,
      body: undefined,
    });
  });

  it('accepts a POST with version, handoff flag, and an object body', () => {
    const msg = parseInboundMessage({
      type: 'apiRequest',
      id: 2,
      method: 'POST',
      url: '/api/note',
      version: 'abc123',
      handoff: true,
      body: { kind: 'span', start: 3, end: 8 },
    });
    expect(msg?.version).toBe('abc123');
    expect(msg?.handoff).toBe(true);
    expect(msg?.body).toEqual({ kind: 'span', start: 3, end: 8 });
  });

  it('rejects anything outside the closed type set', () => {
    expect(parseInboundMessage({ type: 'evil', id: 1, method: 'GET', url: '/api/doc' })).toBeNull();
    expect(parseInboundMessage({ type: 'apiResponse', id: 1, method: 'GET', url: '/api/doc' })).toBeNull();
  });

  it('rejects malformed envelopes', () => {
    expect(parseInboundMessage(null)).toBeNull();
    expect(parseInboundMessage('string')).toBeNull();
    expect(parseInboundMessage([])).toBeNull();
    expect(parseInboundMessage({ type: 'apiRequest', method: 'GET', url: '/api/doc' })).toBeNull(); // no id
    expect(parseInboundMessage({ type: 'apiRequest', id: 'x', method: 'GET', url: '/api/doc' })).toBeNull();
    expect(parseInboundMessage({ type: 'apiRequest', id: 1, method: 'PUT', url: '/api/doc' })).toBeNull();
    expect(parseInboundMessage({ type: 'apiRequest', id: 1, method: 'GET', url: 'http://evil/api' })).toBeNull();
    expect(parseInboundMessage({ type: 'apiRequest', id: 1, method: 'GET', url: '/other' })).toBeNull();
    expect(parseInboundMessage({ type: 'apiRequest', id: 1, method: 'GET', url: '/api/doc', version: 5 })).toBeNull();
    expect(parseInboundMessage({ type: 'apiRequest', id: 1, method: 'POST', url: '/api/note', body: 'no' })).toBeNull();
    expect(parseInboundMessage({ type: 'apiRequest', id: 1, method: 'POST', url: '/api/note', body: [1, 2] })).toBeNull();
  });
});
