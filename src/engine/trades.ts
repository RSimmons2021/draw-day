import type { Trade, TradeId } from './types';

/**
 * A real construction schedule, in order. The dependency edges are the game's
 * most informative signal: you cannot be 80% done with finishes when drywall has
 * barely started, so a claim that says otherwise is worth holding.
 */
export const TRADES: readonly Trade[] = [
  { id: 'sitework', name: 'Sitework & Demo', requires: [], budgetShare: 0.06 },
  { id: 'foundation', name: 'Foundation', requires: ['sitework'], budgetShare: 0.12 },
  { id: 'framing', name: 'Framing', requires: ['foundation'], budgetShare: 0.18 },
  { id: 'envelope', name: 'Roof & Envelope', requires: ['framing'], budgetShare: 0.1 },
  { id: 'mep', name: 'MEP Rough-In', requires: ['framing'], budgetShare: 0.16 },
  { id: 'drywall', name: 'Insulation & Drywall', requires: ['mep', 'envelope'], budgetShare: 0.12 },
  { id: 'finishes', name: 'Interior Finishes', requires: ['drywall'], budgetShare: 0.16 },
  { id: 'punch', name: 'Punch & Final', requires: ['finishes'], budgetShare: 0.1 },
];

export const TRADE_BY_ID: Record<TradeId, Trade> = Object.fromEntries(
  TRADES.map((t) => [t.id, t]),
) as Record<TradeId, Trade>;

export const CONTRACTOR_NAMES: readonly string[] = [
  'Alvarez & Sons',
  'Beckman Build Co.',
  'Cortland Trades',
  'Delgado Mechanical',
  'Eastline Partners',
  'Fairweather LLC',
  'Grayson Group',
  'Halstead Contracting',
];

/** Claims that overstate real progress by more than this are inflated. */
export const TOLERANCE_PCT = 8;

/** Standard holdback on every disbursement, released when the project completes. */
export const RETAINAGE_RATE = 0.07;

/**
 * Disbursed-minus-complete, in percentage points, at which the loan is
 * under-collateralized. This is the number a construction lender actually watches:
 * cash out ahead of work in place means a default leaves them short.
 */
export const MAX_EXPOSURE_PCT = 12;

/**
 * Goodwill lost when an honest contractor gets sent back empty-handed.
 *
 * Scaled for a five-draw run: three bad holds is survivable, four is not.
 */
export const TRUST_PENALTY_WRONG_HOLD = 30;

/** Small friction even on a correct hold — the crew still waits on cash. */
export const TRUST_PENALTY_CORRECT_HOLD = 4;

/** Goodwill recovered by paying an honest draw on time. */
export const TRUST_REWARD_FUND = 6;

/**
 * Cost of buying the same work twice.
 *
 * Funding a claim that was not backed by work does not just delay the project: the
 * crew that took the money is not coming back to do it for free, so the remainder
 * gets built by someone else at a premium. This is what makes rubber-stamping a
 * losing strategy rather than merely a slower one.
 */
export const REWORK_PREMIUM = 1.35;

/**
 * A line item only comes back so many times. Past this the contractor gives up,
 * which also guarantees the queue terminates instead of cycling forever.
 */
export const MAX_RESUBMITS = 3;
