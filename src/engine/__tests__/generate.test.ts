import { describe, expect, it } from 'vitest';
import { TARGET_DRAWS, generateRun, prepareDraw } from '../generate';
import { TOLERANCE_PCT, TRADES, TRADE_BY_ID } from '../trades';
import { createRun, reducer, selectCurrentDraw } from '../reducer';
import type { TradeId } from '../types';

const SEEDS = Array.from({ length: 120 }, (_, i) => `gen-${i}`);

function emptyTradeMap(): Record<TradeId, number> {
  return Object.fromEntries(TRADES.map((t) => [t.id, 0])) as Record<TradeId, number>;
}

describe('trade table', () => {
  it('budget shares sum to the whole project', () => {
    const total = TRADES.reduce((sum, t) => sum + t.budgetShare, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('is in topological order, so prerequisites always come first', () => {
    const seen = new Set<TradeId>();
    for (const trade of TRADES) {
      for (const req of trade.requires) expect(seen.has(req)).toBe(true);
      seen.add(trade.id);
    }
  });

  it('every prerequisite refers to a real trade', () => {
    for (const trade of TRADES) {
      for (const req of trade.requires) expect(TRADE_BY_ID[req]).toBeDefined();
    }
  });
});

describe('generateRun', () => {
  it('is deterministic for a given seed', () => {
    const a = generateRun('repeat');
    const b = generateRun('repeat');
    expect(JSON.stringify(a.specs)).toEqual(JSON.stringify(b.specs));
    expect(a.contractors).toEqual(b.contractors);
  });

  it('produces different runs for different seeds', () => {
    const a = generateRun('one');
    const b = generateRun('two');
    expect(JSON.stringify(a.specs)).not.toEqual(JSON.stringify(b.specs));
  });

  it('deals exactly the intended number of draws', () => {
    for (const seed of SEEDS) {
      expect(generateRun(seed).specs.length).toBe(TARGET_DRAWS);
    }
  });

  it('covers a whole project once the budget is renormalised', () => {
    for (const seed of SEEDS) {
      const { trades } = generateRun(seed);
      expect(trades.reduce((sum, t) => sum + t.budgetShare, 0)).toBeCloseTo(1, 10);
    }
  });

  it('keeps the prerequisite chain inside the run, never dangling', () => {
    for (const seed of SEEDS) {
      const { trades } = generateRun(seed);
      const ids = new Set(trades.map((t) => t.id));
      for (const trade of trades) {
        for (const req of trade.requires) expect(ids.has(req)).toBe(true);
      }
      // A slice with no edges at all would leave "out of sequence" unreachable.
      expect(trades.some((t) => t.requires.length > 0)).toBe(true);
    }
  });

  it('gives every trade in the run a ladder that ends at 100', () => {
    for (const seed of SEEDS) {
      const { specs, trades } = generateRun(seed);
      for (const trade of trades) {
        const rungs = specs.filter((s) => s.trade.id === trade.id).map((s) => s.claimLevel);
        expect(rungs.length).toBeGreaterThanOrEqual(1);
        expect(Math.max(...rungs)).toBe(100);
      }
    }
  });

  it('keeps each trade\'s rungs strictly ascending in queue order', () => {
    for (const seed of SEEDS) {
      const { specs, trades } = generateRun(seed);
      for (const trade of trades) {
        const rungs = specs.filter((s) => s.trade.id === trade.id).map((s) => s.claimLevel);
        expect([...rungs].sort((a, b) => a - b)).toEqual(rungs);
      }
    }
  });

  it('always leaves something to catch and something to fund', () => {
    for (const seed of SEEDS) {
      const inflated = generateRun(seed).specs.filter((s) => s.overstatement > TOLERANCE_PCT);
      expect(inflated.length).toBeGreaterThanOrEqual(1);
      expect(inflated.length).toBeLessThan(TARGET_DRAWS);
    }
  });

  it('never lets an honest claim overstate past the tolerance band', () => {
    for (const seed of SEEDS) {
      for (const spec of generateRun(seed).specs) {
        const inflated = spec.overstatement > TOLERANCE_PCT;
        if (!inflated) expect(spec.overstatement).toBeLessThanOrEqual(TOLERANCE_PCT);
        else expect(spec.overstatement).toBeGreaterThan(TOLERANCE_PCT);
      }
    }
  });

  it('leaves no gap on an honest closeout, so a clean run can actually finish', () => {
    for (const seed of SEEDS) {
      for (const spec of generateRun(seed).specs) {
        if (spec.claimLevel === 100 && spec.overstatement <= TOLERANCE_PCT) {
          expect(spec.overstatement).toBe(0);
        }
      }
    }
  });

  it('always includes exactly one chronic overstater among the crews', () => {
    for (const seed of SEEDS) {
      const values = Object.values(generateRun(seed).propensityById);
      expect(values.filter((p) => p > 0.4).length).toBe(1);
      expect(values.filter((p) => p <= 0.4).length).toBe(2);
    }
  });

  it('gives every crew work, so every track record is worth reading', () => {
    for (const seed of SEEDS) {
      const { specs, contractors } = generateRun(seed);
      for (const id of Object.keys(contractors)) {
        expect(specs.some((s) => s.contractorId === id)).toBe(true);
      }
    }
  });
});

describe('prepareDraw', () => {
  it('floors truth at work already verified, so progress never reverses', () => {
    const { specs, contractors, facility } = generateRun('floor');
    const spec = specs[0]!;
    const credited = emptyTradeMap();
    credited[spec.trade.id] = 95;
    const draw = prepareDraw(
      spec,
      credited,
      emptyTradeMap(),
      contractors[spec.contractorId]!,
      facility,
    );
    expect(draw.actualPct).toBeGreaterThanOrEqual(95);
  });

  it('bills against verified work, not against cash already paid', () => {
    const { specs, contractors, facility } = generateRun('billing');
    const spec = specs.find((s) => s.claimLevel === 100)!;
    const credited = emptyTradeMap();
    const paid = emptyTradeMap();
    credited[spec.trade.id] = 40;
    paid[spec.trade.id] = 70; // an earlier inflated claim was funded

    const draw = prepareDraw(spec, credited, paid, contractors[spec.contractorId]!, facility);

    // 60 points still to buy, not the 30 the cash position would suggest.
    const expected = Math.round((60 / 100) * spec.trade.budgetShare * facility);
    expect(draw.amount).toBe(expected);
  });

  it('never asks for a negative amount', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      let state = createRun(seed);
      for (let i = 0; i < 200 && state.status === 'running'; i++) {
        const draw = selectCurrentDraw(state);
        if (!draw) break;
        expect(draw.amount).toBeGreaterThanOrEqual(0);
        state = reducer(state, { type: 'decide', decision: draw.inflated ? 'hold' : 'fund' });
      }
    }
  });

  it('always surfaces at least one piece of evidence', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      let state = createRun(seed);
      for (let i = 0; i < 200 && state.status === 'running'; i++) {
        const draw = selectCurrentDraw(state);
        if (!draw) break;
        expect(draw.evidence.length).toBeGreaterThan(0);
        state = reducer(state, { type: 'decide', decision: 'fund' });
      }
    }
  });

  it('is pure — same spec and same state gives the same card', () => {
    const { specs, contractors, facility } = generateRun('pure');
    const spec = specs[3]!;
    const args = [
      spec,
      emptyTradeMap(),
      emptyTradeMap(),
      contractors[spec.contractorId]!,
      facility,
    ] as const;
    expect(prepareDraw(...args)).toEqual(prepareDraw(...args));
  });
});
