import { describe, expect, it } from 'vitest';
import {
  createRun,
  reducer,
  selectCurrentDraw,
  selectExposure,
  selectRemaining,
  type RunState,
} from '../reducer';
import { MAX_EXPOSURE_PCT, RETAINAGE_RATE, TRADES } from '../trades';
import type { Decision } from '../types';

const SEEDS = Array.from({ length: 60 }, (_, i) => `red-${i}`);

function playTo(seed: string, choose: (inflated: boolean) => Decision): RunState {
  let state = createRun(seed);
  for (let i = 0; i < 400 && state.status === 'running'; i++) {
    const draw = selectCurrentDraw(state);
    if (!draw) break;
    state = reducer(state, { type: 'decide', decision: choose(draw.inflated) });
  }
  return state;
}

/** Advance a run to its first honest draw, holding the inflated ones on the way. */
function firstHonestDraw(seed: string): { run: RunState } {
  let run = createRun(seed);
  for (let i = 0; i < 200 && run.status === 'running'; i++) {
    const draw = selectCurrentDraw(run);
    if (!draw) break;
    if (!draw.inflated) return { run };
    run = reducer(run, { type: 'decide', decision: 'hold' });
  }
  throw new Error(`no honest draw reachable on seed ${seed}`);
}

describe('createRun', () => {
  it('starts every trade at zero and the facility untouched', () => {
    const state = createRun('start');
    expect(state.status).toBe('running');
    expect(state.disbursed).toBe(0);
    expect(state.completion).toBe(0);
    expect(state.trust).toBe(100);
    for (const trade of TRADES) {
      expect(state.creditedByTrade[trade.id]).toBe(0);
      expect(state.paidByTrade[trade.id]).toBe(0);
    }
  });

  it('is fully reproducible from its seed', () => {
    expect(JSON.stringify(createRun('same'))).toEqual(JSON.stringify(createRun('same')));
  });
});

describe('decisions', () => {
  it('does not mutate the state it is given', () => {
    const state = createRun('immutable');
    const before = JSON.stringify(state);
    reducer(state, { type: 'decide', decision: 'fund' });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('ignores decisions once the run is over', () => {
    const finished = playTo('over', (inflated) => (inflated ? 'hold' : 'fund'));
    expect(finished.status).not.toBe('running');
    expect(reducer(finished, { type: 'decide', decision: 'fund' })).toBe(finished);
  });

  it('withholds retainage on every disbursement', () => {
    const state = createRun('retain');
    const draw = selectCurrentDraw(state)!;
    const next = reducer(state, { type: 'decide', decision: 'fund' });
    const withheld = Math.round(draw.amount * RETAINAGE_RATE);
    expect(next.retainage).toBe(withheld);
    expect(next.disbursed).toBe(draw.amount - withheld);
  });

  it('credits only work in place, so an inflated fund buys less than it pays for', () => {
    for (const seed of SEEDS) {
      let state = createRun(seed);
      for (let i = 0; i < 200 && state.status === 'running'; i++) {
        const draw = selectCurrentDraw(state);
        if (!draw) break;
        if (draw.inflated && draw.amount > 0) {
          const next = reducer(state, { type: 'decide', decision: 'fund' });
          expect(next.creditedByTrade[draw.spec.trade.id]).toBeLessThan(draw.claimPct);
          expect(next.paidByTrade[draw.spec.trade.id]).toBe(draw.claimPct);
          return;
        }
        state = reducer(state, { type: 'decide', decision: 'fund' });
      }
    }
    throw new Error('no inflated draw was reachable across the sampled seeds');
  });

  it('makes an overfunded gap come back as a second bill', () => {
    for (const seed of SEEDS) {
      let state = createRun(seed);
      for (let i = 0; i < 200 && state.status === 'running'; i++) {
        const draw = selectCurrentDraw(state);
        if (!draw) break;
        if (draw.inflated) {
          const before = state.queue.length;
          const next = reducer(state, { type: 'decide', decision: 'fund' });
          expect(next.queue.length).toBe(before + 1);
          return;
        }
        state = reducer(state, { type: 'decide', decision: 'fund' });
      }
    }
    throw new Error('no inflated draw was reachable across the sampled seeds');
  });

  it('sends a held draw back so the run stays winnable', () => {
    const state = createRun('resub');
    const before = state.queue.length;
    const next = reducer(state, { type: 'decide', decision: 'hold' });
    expect(next.queue.length).toBe(before + 1);
    expect(next.disbursed).toBe(0);
  });

  it('costs far more trust to refuse an honest draw than a dishonest one', () => {
    for (const seed of SEEDS) {
      let state = createRun(seed);
      let honestCost: number | null = null;
      let inflatedCost: number | null = null;
      for (let i = 0; i < 200 && state.status === 'running'; i++) {
        const draw = selectCurrentDraw(state);
        if (!draw) break;
        const next = reducer(state, { type: 'decide', decision: 'hold' });
        const cost = state.trust - next.trust;
        if (draw.inflated) inflatedCost ??= cost;
        else honestCost ??= cost;
        if (honestCost !== null && inflatedCost !== null) {
          expect(honestCost).toBeGreaterThan(inflatedCost);
          return;
        }
        state = next;
      }
    }
    throw new Error('did not observe both a correct and an incorrect hold');
  });
});

describe('terminal states', () => {
  it('always terminates, whatever the player does', () => {
    const strategies: Array<(inflated: boolean) => Decision> = [
      (inflated) => (inflated ? 'hold' : 'fund'),
      () => 'fund',
      () => 'hold',
      (inflated) => (inflated ? 'fund' : 'hold'),
    ];
    for (const strategy of strategies) {
      for (const seed of SEEDS) {
        expect(playTo(seed, strategy).status).not.toBe('running');
      }
    }
  });

  it('closes out at 100% completion', () => {
    const won = playTo('win', (inflated) => (inflated ? 'hold' : 'fund'));
    expect(won.status).toBe('won');
    expect(won.completion).toBe(100);
    expect(won.lossReason).toBeNull();
  });

  it('never reports a completion above 100', () => {
    for (const seed of SEEDS) {
      const state = playTo(seed, (inflated) => (inflated ? 'hold' : 'fund'));
      expect(state.completion).toBeLessThanOrEqual(100);
    }
  });

  it('calls the loan underwater only past the exposure limit', () => {
    for (const seed of SEEDS) {
      const state = playTo(seed, () => 'fund');
      if (state.lossReason === 'underwater') {
        expect(selectExposure(state)).toBeGreaterThan(MAX_EXPOSURE_PCT);
      }
    }
  });

  it('ends in a walk-off when trust runs out', () => {
    const state = playTo('walk', () => 'hold');
    expect(state.status).toBe('lost');
    expect(state.lossReason).toBe('walkoff');
    expect(state.trust).toBe(0);
  });

  it('never reports negative trust', () => {
    for (const seed of SEEDS) {
      const state = playTo(seed, () => 'hold');
      expect(state.trust).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('selectors', () => {
  it('reports no current draw once the run is over', () => {
    const finished = playTo('sel', (inflated) => (inflated ? 'hold' : 'fund'));
    expect(selectCurrentDraw(finished)).toBeNull();
  });

  it('counts down the remaining queue when a draw is cleared for good', () => {
    // Funding an inflated claim does not shorten the queue — the unbuilt work comes
    // straight back as a second bill — so this has to be measured on an honest one.
    const state = firstHonestDraw('remaining');
    const before = selectRemaining(state.run);
    expect(before).toBeGreaterThan(0);
    const after = reducer(state.run, { type: 'decide', decision: 'fund' });
    expect(selectRemaining(after)).toBe(before - 1);
  });

  it('keeps exposure negative while draws are funded honestly, because of retainage', () => {
    const state = firstHonestDraw('exposure');
    const after = reducer(state.run, { type: 'decide', decision: 'fund' });
    expect(selectExposure(after)).toBeLessThan(0);
  });

  it('skips line items whose work is already verified and paid', () => {
    for (const seed of SEEDS) {
      let state = createRun(seed);
      for (let i = 0; i < 200 && state.status === 'running'; i++) {
        const draw = selectCurrentDraw(state);
        if (!draw) break;
        expect(state.creditedByTrade[draw.spec.trade.id]).toBeLessThan(draw.spec.claimLevel);
        state = reducer(state, { type: 'decide', decision: draw.inflated ? 'hold' : 'fund' });
      }
    }
  });
});

describe('start action', () => {
  it('resets to a fresh run on the given seed', () => {
    const played = playTo('restart', () => 'fund');
    const fresh = reducer(played, { type: 'start', seed: 'restart' });
    expect(JSON.stringify(fresh)).toEqual(JSON.stringify(createRun('restart')));
  });
});
