import { describe, expect, it } from 'vitest';
import { createRng, dailySeed } from '../rng';

describe('createRng', () => {
  it('produces the same stream for the same seed', () => {
    const a = Array.from({ length: 50 }, () => createRng('seed-a').next());
    expect(new Set(a).size).toBe(1);

    const first = createRng('x');
    const second = createRng('x');
    const left = Array.from({ length: 50 }, () => first.next());
    const right = Array.from({ length: 50 }, () => second.next());
    expect(left).toEqual(right);
  });

  it('produces different streams for different seeds', () => {
    const left = Array.from({ length: 20 }, () => createRng('x').int(0, 1e9));
    const right = Array.from({ length: 20 }, () => createRng('y').int(0, 1e9));
    expect(left[0]).not.toBe(right[0]);
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() is inclusive at both ends and never escapes them', () => {
    const rng = createRng('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = rng.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('int() handles a single-value range', () => {
    const rng = createRng('single');
    expect(rng.int(4, 4)).toBe(4);
  });

  it('pick() throws rather than handing back undefined', () => {
    expect(() => createRng('empty').pick([])).toThrow(/empty/);
  });

  it('is roughly uniform', () => {
    const rng = createRng('uniform');
    const buckets = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng.next() * 10)]++;
    for (const count of buckets) {
      expect(Math.abs(count - n / 10) / (n / 10)).toBeLessThan(0.05);
    }
  });
});

describe('dailySeed', () => {
  it('formats as YYYY-MM-DD in local time', () => {
    expect(dailySeed(new Date(2026, 7, 14, 13, 30))).toBe('2026-08-14');
  });

  it('zero-pads single-digit months and days', () => {
    expect(dailySeed(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('is stable across times of day but changes across dates', () => {
    expect(dailySeed(new Date(2026, 7, 14, 0, 0))).toBe(
      dailySeed(new Date(2026, 7, 14, 23, 59)),
    );
    expect(dailySeed(new Date(2026, 7, 14))).not.toBe(dailySeed(new Date(2026, 7, 15)));
  });
});
