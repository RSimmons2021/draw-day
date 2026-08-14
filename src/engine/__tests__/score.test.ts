import { describe, expect, it } from 'vitest';
import { createRun, reducer, selectCurrentDraw, type RunState } from '../reducer';
import { LOSS_COPY, scoreRun, shareText } from '../score';
import type { Decision, LossReason } from '../types';

function play(seed: string, choose: (inflated: boolean) => Decision): RunState {
  let state = createRun(seed);
  for (let i = 0; i < 400 && state.status === 'running'; i++) {
    const draw = selectCurrentDraw(state);
    if (!draw) break;
    state = reducer(state, { type: 'decide', decision: choose(draw.inflated) });
  }
  return state;
}

const perfect = play('score-perfect', (inflated) => (inflated ? 'hold' : 'fund'));
const sloppy = play('score-sloppy', () => 'fund');

describe('scoreRun', () => {
  it('scores a clean run at full accuracy with nothing leaked', () => {
    const card = scoreRun(perfect);
    expect(card.won).toBe(true);
    expect(card.accuracy).toBe(1);
    expect(card.correct).toBe(card.decisions);
    expect(card.leakage).toBe(0);
    expect(card.grade).toBe('Portfolio lead');
  });

  it('returns retainage only when the project closes out', () => {
    const won = scoreRun(perfect);
    expect(won.capitalPreserved).toBe(
      Math.round(perfect.facility - perfect.disbursed + perfect.retainage),
    );
    const lost = scoreRun(sloppy);
    expect(lost.capitalPreserved).toBe(Math.round(sloppy.facility - sloppy.disbursed));
  });

  it('counts leakage only against funds that were not backed by work', () => {
    const card = scoreRun(sloppy);
    expect(card.won).toBe(false);
    expect(card.leakage).toBeGreaterThan(0);
    expect(card.leakage).toBeLessThanOrEqual(sloppy.disbursed);
  });

  it('handles a run with no decisions without dividing by zero', () => {
    const card = scoreRun(createRun('untouched'));
    expect(card.decisions).toBe(0);
    expect(card.accuracy).toBe(0);
    expect(Number.isNaN(card.accuracy)).toBe(false);
  });

  it('grades a loss as a loan review regardless of accuracy', () => {
    expect(scoreRun(sloppy).grade).toBe('Loan review');
  });
});

describe('shareText', () => {
  it('names the seed and never leaks the answers', () => {
    const text = shareText(perfect, scoreRun(perfect));
    expect(text).toContain('score-perfect');
    expect(text).not.toMatch(/Foundation|Framing|Drywall/);
    expect(text).not.toMatch(/\d+%/);
  });

  it('emits one mark per decision', () => {
    const card = scoreRun(perfect);
    const marks = [...shareText(perfect, card).matchAll(/[🟩🟦🟥🟨]/gu)];
    expect(marks.length).toBe(card.decisions);
  });

  it('distinguishes a win from a loss', () => {
    expect(shareText(perfect, scoreRun(perfect))).toContain('closed out');
    expect(shareText(sloppy, scoreRun(sloppy))).not.toContain('closed out');
  });
});

describe('loss copy', () => {
  it('covers every reason the reducer can produce', () => {
    const reasons: LossReason[] = ['underwater', 'walkoff', 'facility', 'stalled'];
    for (const reason of reasons) {
      expect(LOSS_COPY[reason].title).toBeTruthy();
      expect(LOSS_COPY[reason].body).toBeTruthy();
    }
  });
});
