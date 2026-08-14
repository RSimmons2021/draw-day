import { generateRun, prepareDraw, type DrawSpec, type PreparedDraw } from './generate';
import {
  MAX_EXPOSURE_PCT,
  MAX_RESUBMITS,
  REWORK_PREMIUM,
  RETAINAGE_RATE,
  TRADES,
  TRUST_PENALTY_CORRECT_HOLD,
  TRUST_PENALTY_WRONG_HOLD,
  TRUST_REWARD_FUND,
} from './trades';
import type { ContractorRecord, Decision, GameState, TradeId } from './types';

export interface RunState extends GameState {
  queue: DrawSpec[];
  cursor: number;
}

export type Action =
  | { type: 'start'; seed: string }
  | { type: 'decide'; decision: Decision };

/** Completion at or above this counts as closeout — floating point never lands on 100. */
const COMPLETE_PCT = 99.9;

/** How far a held draw is pushed back before the contractor resubmits. */
const RESUBMIT_DELAY = 2;

/** How far back a change order for already-paid work lands. */
const FOLLOW_UP_DELAY = 3;

function emptyTradeMap(): Record<TradeId, number> {
  return Object.fromEntries(TRADES.map((t) => [t.id, 0])) as Record<TradeId, number>;
}

export function createRun(seed: string): RunState {
  const run = generateRun(seed);
  return {
    seed,
    status: 'running',
    lossReason: null,
    facility: run.facility,
    disbursed: 0,
    retainage: 0,
    completion: 0,
    trust: 100,
    paidByTrade: emptyTradeMap(),
    creditedByTrade: emptyTradeMap(),
    contractors: run.contractors,
    log: [],
    queue: run.specs,
    cursor: 0,
  };
}

/**
 * Index of the next draw with anything left to bill.
 *
 * A held line item can be overtaken by a later draw on the same trade, which leaves
 * a spec in the queue whose work is already verified and paid. Those are dead, not
 * decisions — skipping them here is what stops the queue looping forever.
 */
function nextIndex(state: RunState): number {
  let i = state.cursor;
  while (i < state.queue.length) {
    const spec = state.queue[i];
    if (!spec) break;
    if (state.creditedByTrade[spec.trade.id] < spec.claimLevel) return i;
    i++;
  }
  return state.queue.length;
}

/** The card on screen, or null when the queue is exhausted. */
export function selectCurrentDraw(state: RunState): PreparedDraw | null {
  if (state.status !== 'running') return null;
  const spec = state.queue[nextIndex(state)];
  if (!spec) return null;
  const contractor = state.contractors[spec.contractorId];
  if (!contractor) return null;
  return prepareDraw(
    spec,
    state.creditedByTrade,
    state.paidByTrade,
    contractor,
    state.facility,
  );
}

/** How many decisions are left, assuming nothing new gets sent back. */
export function selectRemaining(state: RunState): number {
  let count = 0;
  for (let i = nextIndex(state); i < state.queue.length; i++) {
    const spec = state.queue[i];
    if (spec && state.creditedByTrade[spec.trade.id] < spec.claimLevel) count++;
  }
  return count;
}

/**
 * Cash out ahead of work in place, in percentage points.
 *
 * This is the number a construction lender actually watches. Retainage keeps a
 * disciplined run comfortably negative; funding claims that aren't backed by work
 * drives it positive, and past `MAX_EXPOSURE_PCT` the loan is under-collateralized.
 */
export function selectExposure(state: RunState): number {
  return (state.disbursed / state.facility) * 100 - state.completion;
}

function withContractor(
  state: RunState,
  id: string,
  patch: (c: ContractorRecord) => ContractorRecord,
): Record<string, ContractorRecord> {
  const current = state.contractors[id];
  if (!current) return state.contractors;
  return { ...state.contractors, [id]: patch(current) };
}

/**
 * A line item that comes back, billed honestly this time.
 *
 * Every gap between a claim and reality gets paid for eventually; the only question
 * is whether the lender pays for it once or twice. Derived from the original spec
 * rather than drawn fresh, so a run stays reproducible from its seed.
 */
function rebill(spec: DrawSpec, suffix: string, premium: number): DrawSpec {
  return {
    ...spec,
    id: `${spec.id}${suffix}`,
    overstatement: 0,
    resubmits: spec.resubmits + 1,
    premium,
    // Rotate the pre-rolled noise so the resubmission carries different supporting
    // detail without consuming new randomness.
    noise: [...spec.noise.slice(1), spec.noise[0] ?? 0.5],
  };
}

function insertAt(queue: DrawSpec[], index: number, spec: DrawSpec): DrawSpec[] {
  const next = [...queue];
  next.splice(Math.min(index, next.length), 0, spec);
  return next;
}

function settle(state: RunState): RunState {
  if (state.trust <= 0) {
    return { ...state, trust: 0, status: 'lost', lossReason: 'walkoff' };
  }
  if (state.disbursed > state.facility) {
    return { ...state, status: 'lost', lossReason: 'facility' };
  }
  if (state.completion >= COMPLETE_PCT) {
    return { ...state, completion: 100, status: 'won' };
  }
  if (selectExposure(state) > MAX_EXPOSURE_PCT) {
    return { ...state, status: 'lost', lossReason: 'underwater' };
  }
  if (nextIndex(state) >= state.queue.length) {
    return { ...state, status: 'lost', lossReason: 'stalled' };
  }
  return state;
}

function fund(state: RunState, draw: PreparedDraw, index: number): RunState {
  const { spec, claimPct, creditedPct, actualPct, amount, inflated } = draw;
  const tradeId = spec.trade.id;

  const isOriginal = spec.resubmits === 0;
  const withheld = Math.round(amount * RETAINAGE_RATE);
  const released = amount - withheld;

  // Credit only the work that is actually in place. Cash paid beyond that buys
  // nothing, and the missing work still has to be built and billed again.
  const progress = Math.max(0, actualPct - creditedPct) * spec.trade.budgetShare;

  const queue =
    inflated && spec.resubmits < MAX_RESUBMITS
      ? insertAt(state.queue, index + FOLLOW_UP_DELAY, rebill(spec, '~', REWORK_PREMIUM))
      : state.queue;

  return settle({
    ...state,
    disbursed: state.disbursed + released,
    retainage: state.retainage + withheld,
    completion: Math.min(100, state.completion + progress),
    trust: Math.min(100, state.trust + TRUST_REWARD_FUND),
    paidByTrade: { ...state.paidByTrade, [tradeId]: Math.max(draw.paidPct, claimPct) },
    creditedByTrade: { ...state.creditedByTrade, [tradeId]: actualPct },
    contractors: withContractor(state, spec.contractorId, (c) => ({
      ...c,
      funded: c.funded + 1,
      // Only original submissions count toward a track record. A corrected rebill is
      // not an independent chance to lie, and counting it both dilutes the rate and
      // files a pile of honest draws under whatever flag the crew already carries.
      reviewed: isOriginal ? c.reviewed + 1 : c.reviewed,
      // The overstatement surfaces at the next site visit either way.
      caught: inflated && isOriginal ? c.caught + 1 : c.caught,
    })),
    log: [
      ...state.log,
      {
        drawId: spec.id,
        tradeName: spec.trade.name,
        contractorName: state.contractors[spec.contractorId]?.name ?? '',
        decision: 'fund',
        correct: !inflated,
        released,
        progress,
        claimPct,
        actualPct,
      },
    ],
    queue,
    cursor: index + 1,
  });
}

function hold(state: RunState, draw: PreparedDraw, index: number): RunState {
  const { spec, claimPct, actualPct, inflated } = draw;
  const isOriginal = spec.resubmits === 0;

  const queue =
    spec.resubmits < MAX_RESUBMITS
      ? insertAt(state.queue, index + RESUBMIT_DELAY, rebill(spec, '+', spec.premium))
      : state.queue;

  return settle({
    ...state,
    trust:
      state.trust - (inflated ? TRUST_PENALTY_CORRECT_HOLD : TRUST_PENALTY_WRONG_HOLD),
    contractors: withContractor(state, spec.contractorId, (c) => ({
      ...c,
      reviewed: isOriginal ? c.reviewed + 1 : c.reviewed,
      caught: inflated && isOriginal ? c.caught + 1 : c.caught,
    })),
    log: [
      ...state.log,
      {
        drawId: spec.id,
        tradeName: spec.trade.name,
        contractorName: state.contractors[spec.contractorId]?.name ?? '',
        decision: 'hold',
        correct: inflated,
        released: 0,
        progress: 0,
        claimPct,
        actualPct,
      },
    ],
    queue,
    cursor: index + 1,
  });
}

export function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'start':
      return createRun(action.seed);
    case 'decide': {
      if (state.status !== 'running') return state;
      const index = nextIndex(state);
      const draw = selectCurrentDraw(state);
      if (!draw) return settle({ ...state, cursor: state.queue.length });
      return action.decision === 'fund'
        ? fund(state, draw, index)
        : hold(state, draw, index);
    }
  }
}
