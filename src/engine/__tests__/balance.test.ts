import { describe, expect, it } from 'vitest';
import { createRun, reducer, selectCurrentDraw, type RunState } from '../reducer';
import type { Decision, PreparedDraw } from '../index';

type Strategy = (draw: PreparedDraw) => Decision;

const SEEDS = Array.from({ length: 300 }, (_, i) => `balance-${i}`);

/** Cap iterations so a strategy that never terminates fails loudly instead of hanging. */
const MAX_STEPS = 400;

function play(seed: string, strategy: Strategy): RunState {
  let state = createRun(seed);
  for (let i = 0; i < MAX_STEPS && state.status === 'running'; i++) {
    const draw = selectCurrentDraw(state);
    if (!draw) break;
    state = reducer(state, { type: 'decide', decision: strategy(draw) });
  }
  return state;
}

function winRate(strategy: Strategy): number {
  return SEEDS.filter((s) => play(s, strategy).status === 'won').length / SEEDS.length;
}

const perfect: Strategy = (d) => (d.inflated ? 'hold' : 'fund');
const alwaysFund: Strategy = () => 'fund';
const alwaysHold: Strategy = () => 'hold';
const holdOnAnyRedFlag: Strategy = (d) =>
  d.evidence.some((e) => e.tone === 'bad') ? 'hold' : 'fund';
const weighEvidence: Strategy = (d) =>
  d.evidence.reduce((a, e) => a + (e.tone === 'bad' ? 1 : e.tone === 'good' ? -1 : 0), 0) > 0
    ? 'hold'
    : 'fund';

/** A player who reads the card correctly `1 - errorRate` of the time. */
const human = (errorRate: number): Strategy => (d) => {
  const mistaken = (d.spec.noise[7] ?? 0.5) < errorRate;
  return d.inflated !== mistaken ? 'hold' : 'fund';
};

/**
 * These bounds are the design, not incidental measurements. The loop is only
 * interesting if judgment beats reflex, so each rung has to stay separated from the
 * ones around it.
 */
describe('strategy balance', () => {
  it('lets perfect judgment close the loan out every time', () => {
    expect(winRate(perfect)).toBe(1);
  });

  it('punishes rubber-stamping every draw', () => {
    // Structural, not a tuned penalty: funding inflated claims means buying the same
    // work twice, which drains the facility and pushes cash ahead of collateral.
    expect(winRate(alwaysFund)).toBeLessThan(0.12);
  });

  it('punishes holding every draw', () => {
    expect(winRate(alwaysHold)).toBe(0);
  });

  it('punishes reacting to any red flag at all', () => {
    // If flinching at every warning worked, the weak signals would be decoration.
    expect(winRate(holdOnAnyRedFlag)).toBeLessThan(0.1);
  });

  it('beats coin-flipping only if the evidence is actually weighed', () => {
    expect(winRate(weighEvidence)).toBeGreaterThan(0.35);
    expect(winRate(weighEvidence)).toBeLessThan(0.7);
  });

  it('rewards accuracy monotonically', () => {
    const good = winRate(human(0.15));
    const fair = winRate(human(0.25));
    const coin = winRate(human(0.5));
    expect(good).toBeGreaterThan(fair);
    expect(fair).toBeGreaterThan(coin);
    expect(good).toBeGreaterThan(0.6);
    // Five binary calls means luck alone clears the bar sometimes; it must not be
    // anywhere near a strategy.
    expect(coin).toBeLessThan(0.3);
  });

  it('always terminates', () => {
    for (const strategy of [perfect, alwaysFund, alwaysHold, holdOnAnyRedFlag, weighEvidence]) {
      for (const seed of SEEDS.slice(0, 40)) {
        expect(play(seed, strategy).status).not.toBe('running');
      }
    }
  });
});

describe('evidence is informative', () => {
  /** Share of draws carrying a signal that really were inflated. */
  function precision(label: string): { fires: number; precision: number; base: number } {
    let hit = 0;
    let fired = 0;
    let inflated = 0;
    let total = 0;
    for (const seed of SEEDS) {
      let state = createRun(seed);
      for (let i = 0; i < MAX_STEPS && state.status === 'running'; i++) {
        const draw = selectCurrentDraw(state);
        if (!draw) break;
        total++;
        if (draw.inflated) inflated++;
        if (draw.evidence.some((e) => e.label === label)) {
          fired++;
          if (draw.inflated) hit++;
        }
        state = reducer(state, {
          type: 'decide',
          decision: draw.inflated ? 'hold' : 'fund',
        });
      }
    }
    return { fires: fired / total, precision: fired === 0 ? 0 : hit / fired, base: inflated / total };
  }

  it('makes an off-site photo close to damning', () => {
    const { precision: p, base } = precision('Photo off-site');
    expect(p / base).toBeGreaterThan(1.8);
  });

  it('makes a third-party inspection close to exculpatory', () => {
    const { precision: p, base } = precision('Inspection matches');
    expect(p / base).toBeLessThan(0.35);
  });

  it('points the weaker tells in the right direction', () => {
    for (const label of ['Stale photos', 'Out of sequence', 'Chronic overstater']) {
      const { precision: p, base } = precision(label);
      expect(p / base).toBeGreaterThan(1.25);
    }
    for (const label of ['Materials delivered', 'Clean history']) {
      const { precision: p, base } = precision(label);
      expect(p / base).toBeLessThan(0.8);
    }
  });

  it('keeps the missing lien waiver as a genuine red herring', () => {
    // Looks alarming, means almost nothing. Without at least one of these, "hold on
    // anything that looks bad" would be a winning strategy.
    const { precision: p, base } = precision('Lien waiver missing');
    expect(Math.abs(p / base - 1)).toBeLessThan(0.25);
  });
});
