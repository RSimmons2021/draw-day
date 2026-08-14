import { selectExposure, type RunState } from './reducer';
import type { LossReason } from './types';

export interface Scorecard {
  won: boolean;
  /** Cash never released, in $K. Retainage comes back at closeout on a win. */
  capitalPreserved: number;
  decisions: number;
  correct: number;
  accuracy: number;
  /** Cash released against work that was not in place, in $K. */
  leakage: number;
  trust: number;
  exposure: number;
  grade: string;
}

export const LOSS_COPY: Record<LossReason, { title: string; body: string }> = {
  underwater: {
    title: 'Loan underwater',
    body: 'Cash out ran too far ahead of work in place. If the borrower walked today, the collateral would not cover the balance.',
  },
  walkoff: {
    title: 'Crew walked off',
    body: 'Too many honest draws sent back. The contractors stopped waiting on you and took other work.',
  },
  facility: {
    title: 'Facility exhausted',
    body: 'The loan is fully drawn and the project is not finished. Paying twice for the same work is what got you here.',
  },
  stalled: {
    title: 'Project stalled',
    body: 'The draw queue ran dry before closeout. Work that was never funded never got built.',
  },
};

export function scoreRun(state: RunState): Scorecard {
  const won = state.status === 'won';
  const decisions = state.log.length;
  const correct = state.log.filter((d) => d.correct).length;

  // Every dollar released on a fund that was not backed by work in place.
  const leakage = state.log
    .filter((d) => d.decision === 'fund' && !d.correct)
    .reduce((sum, d) => {
      const unearned = (d.claimPct - d.actualPct) / Math.max(1, d.claimPct);
      return sum + d.released * unearned;
    }, 0);

  const capitalPreserved =
    state.facility - state.disbursed + (won ? state.retainage : 0);

  const accuracy = decisions === 0 ? 0 : correct / decisions;

  return {
    won,
    capitalPreserved: Math.round(capitalPreserved),
    decisions,
    correct,
    accuracy,
    leakage: Math.round(leakage),
    trust: Math.round(state.trust),
    exposure: Number(selectExposure(state).toFixed(1)),
    grade: grade(won, accuracy),
  };
}

function grade(won: boolean, accuracy: number): string {
  if (!won) return 'Loan review';
  if (accuracy >= 0.95) return 'Portfolio lead';
  if (accuracy >= 0.85) return 'Senior underwriter';
  if (accuracy >= 0.7) return 'Draw analyst';
  return 'Provisional';
}

const MARKS = {
  fundCorrect: '🟩',
  holdCorrect: '🟦',
  fundWrong: '🟥',
  holdWrong: '🟨',
} as const;

/** Wordle-style result the player can paste anywhere without spoiling the answers. */
export function shareText(state: RunState, card: Scorecard): string {
  const grid = state.log
    .map((d) => {
      if (d.decision === 'fund') return d.correct ? MARKS.fundCorrect : MARKS.fundWrong;
      return d.correct ? MARKS.holdCorrect : MARKS.holdWrong;
    })
    .reduce<string[]>((rows, mark, i) => {
      if (i % 8 === 0) rows.push('');
      rows[rows.length - 1] += mark;
      return rows;
    }, [])
    .join('\n');

  const headline = card.won
    ? `closed out · $${card.capitalPreserved}K unspent`
    : `${LOSS_COPY[state.lossReason ?? 'stalled'].title.toLowerCase()}`;

  return [`Draw Day ${state.seed}`, headline, '', grid].join('\n');
}
