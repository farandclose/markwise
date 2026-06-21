import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelfWriteSuppressor, Debouncer } from '../../src/watchCore';

describe('SelfWriteSuppressor', () => {
  it('suppresses a self-write across repeated events (one OS write can fire several)', () => {
    const s = new SelfWriteSuppressor();
    s.record('aaa');
    expect(s.isSelfWrite('aaa')).toBe(true);
    expect(s.isSelfWrite('aaa')).toBe(true); // membership, not consumed - repeated events stay suppressed
  });

  it('never suppresses an external write with novel content', () => {
    const s = new SelfWriteSuppressor();
    s.record('self');
    expect(s.isSelfWrite('agent')).toBe(false);
  });

  it('does not swallow an interleaved agent write (different content)', () => {
    const s = new SelfWriteSuppressor();
    s.record('A'); // extension write A
    // the flush reads current disk = the agent's B, which is not one of ours
    expect(s.isSelfWrite('B')).toBe(false);
    expect(s.isSelfWrite('A')).toBe(true);
  });

  it('evicts oldest entries beyond the bound', () => {
    const s = new SelfWriteSuppressor(2);
    s.record('1');
    s.record('2');
    s.record('3'); // evicts '1'
    expect(s.isSelfWrite('1')).toBe(false);
    expect(s.isSelfWrite('2')).toBe(true);
    expect(s.isSelfWrite('3')).toBe(true);
  });
});

describe('Debouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst into one trailing call', () => {
    const fn = vi.fn();
    const d = new Debouncer(150, fn);
    d.schedule();
    d.schedule();
    d.schedule();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires again for a later, separate burst', () => {
    const fn = vi.fn();
    const d = new Debouncer(100, fn);
    d.schedule();
    vi.advanceTimersByTime(100);
    d.schedule();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not fire after dispose', () => {
    const fn = vi.fn();
    const d = new Debouncer(100, fn);
    d.schedule();
    d.dispose();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});
