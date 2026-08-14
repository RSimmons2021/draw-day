import { createRng, type Rng } from './rng';
import { CONTRACTOR_NAMES, TOLERANCE_PCT, TRADES } from './trades';
import type { ContractorRecord, Evidence, Trade, TradeId } from './types';

/**
 * Content for one draw, fixed at generation time.
 *
 * The spec stores what the contractor *claims*, not what is true. Ground truth is
 * derived at deal time as `claimLevel - overstatement`, floored at the work already
 * verified — that floor is what keeps the truth monotonic no matter what order the
 * player funds things in.
 *
 * `paidPct` and the evidence list are likewise derived rather than stored, because
 * both depend on the player's history. The pre-rolled `noise` keeps that derivation
 * deterministic without threading a mutable Rng through the reducer.
 */
export interface DrawSpec {
  id: string;
  contractorId: string;
  trade: Trade;
  /** Cumulative percent complete being billed. */
  claimLevel: number;
  /** Percentage points by which the claim overstates reality. */
  overstatement: number;
  /** Times this line item has already come back. Capped to guarantee termination. */
  resubmits: number;
  /**
   * Cost multiplier on this bill. Above 1 when the work is being bought a second
   * time: the original crew was already paid for it, so finishing it means paying
   * someone else a premium to come in behind them.
   */
  premium: number;
  noise: readonly number[];
}

export interface GeneratedRun {
  seed: string;
  facility: number;
  /** The trades this loan covers, with budget shares renormalised over them. */
  trades: Trade[];
  specs: DrawSpec[];
  contractors: Record<string, ContractorRecord>;
  /** Hidden per-contractor tendency to overstate. Exposed for tests, never rendered. */
  propensityById: Record<string, number>;
}

/** Total loan facility in $K. */
export const FACILITY = 2400;

/** Draws in a run before anything gets sent back. Short on purpose. */
export const TARGET_DRAWS = 5;

/** Trades the loan covers, one crew each. */
const TRADES_PER_RUN = 3;

/** Contractors per run — one per trade. */
const ROSTER_SIZE = TRADES_PER_RUN;

/**
 * Inflated claims per run, chosen up front.
 *
 * At least one, so there is always something to catch; at most three, so funding is
 * never the wrong answer everywhere.
 */
const MIN_INFLATED = 1;
const MAX_INFLATED = 3;

/** How often each kind of contractor overstates. One crew in three is hot. */
const HOT_PROPENSITY = 0.62;
const CLEAN_PROPENSITY = 0.16;

/** Draws needed before a track record says anything. */
const RECORD_MIN_SAMPLE = 3;

/** Draws each crew brings from previous loans with this lender. */
const PRIOR_HISTORY_MIN = 4;
const PRIOR_HISTORY_MAX = 8;

/**
 * Share of a contractor's reviewed draws that must be bad before it is a flag.
 *
 * Sits between the two crew types: honest crews overstate about 16% of original
 * submissions, chronic ones about 62%.
 */
const RECORD_BAD_RATE = 0.35;

/** Chance an inflated high claim is also billed ahead of its prerequisite. */
const SEQUENCE_JUMP_CHANCE = 0.45;

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const NOISE_ROLLS = 8;

/**
 * Likelihood of each noisy signal appearing, conditioned on whether the claim is
 * inflated. These are the whole game: no single signal is decisive, so the player
 * has to weigh several weak indicators. `LIEN_WAIVER_MISSING` is near-identical in
 * both columns on purpose — a red herring that punishes "hold on any red flag".
 */
const SIGNAL_LIKELIHOOD = {
  INSPECTOR_VERIFIED: { honest: 0.45, inflated: 0.05 },
  MATERIALS_ON_SITE: { honest: 0.5, inflated: 0.18 },
  GEO_MISMATCH: { honest: 0.03, inflated: 0.3 },
  PHOTO_STALE: { honest: 0.16, inflated: 0.42 },
  LIEN_WAIVER_MISSING: { honest: 0.22, inflated: 0.26 },
} as const;

/**
 * A claim above this on a trade whose prerequisite is barely underway is treated as
 * out of sequence. Generation and detection share the constant so the signal means
 * the same thing on both sides.
 */
const SEQUENCE_CLAIM_MIN = 55;

/** Prerequisite verification below this makes a high claim implausible. */
const SEQUENCE_PREREQ_MAX = 45;

/**
 * Which trades this loan covers.
 *
 * A contiguous slice of the schedule, so the prerequisite edges between them
 * survive and "out of sequence" still means something. Requirements pointing
 * outside the slice are dropped, and the budget is renormalised over what is left
 * so the five draws still add up to a whole project.
 */
function selectTrades(rng: Rng): Trade[] {
  const start = rng.int(0, TRADES.length - TRADES_PER_RUN);
  const window = TRADES.slice(start, start + TRADES_PER_RUN);
  const ids = new Set(window.map((t) => t.id));
  const totalShare = window.reduce((sum, t) => sum + t.budgetShare, 0);
  return window.map((t) => ({
    ...t,
    requires: t.requires.filter((r) => ids.has(r)),
    budgetShare: t.budgetShare / totalShare,
  }));
}

/**
 * How many rungs each trade bills across, summing to TARGET_DRAWS.
 *
 * Two trades bill twice and one bills only at completion, so the queue mixes
 * partial claims against a running balance with a single "we're done, pay us" —
 * which is the claim most worth getting right.
 */
function ladderSizes(rng: Rng): number[] {
  const sizes = [2, 2, 1];
  if (sizes.reduce((a, b) => a + b, 0) !== TARGET_DRAWS) {
    throw new Error('ladder sizes must sum to TARGET_DRAWS');
  }
  return shuffle(rng, sizes);
}

/** The ladder of cumulative percentages a trade bills at. Always ends at 100. */
function claimLadder(rng: Rng, rungs: number): number[] {
  return rungs === 1 ? [100] : [rng.int(35, 62), 100];
}

export function generateRun(seed: string): GeneratedRun {
  const rng = createRng(seed);
  const runTrades = selectTrades(rng);

  // Each crew has a fixed propensity to overstate, and carries a history from
  // earlier loans. Over five draws there is no time to build a read on anyone from
  // scratch, so the prior record is the track-record mechanic rather than a
  // supplement to it.
  const roster = shuffle(rng, [...CONTRACTOR_NAMES]).slice(0, ROSTER_SIZE);
  const propensities = shuffle(rng, [
    HOT_PROPENSITY,
    CLEAN_PROPENSITY,
    CLEAN_PROPENSITY,
  ]);
  const contractors: Record<string, ContractorRecord> = {};
  const propensityById: Record<string, number> = {};
  roster.forEach((name, i) => {
    const id = `c${i}`;
    const propensity = propensities[i] ?? CLEAN_PROPENSITY;
    // A lender already knows who it has been burned by, and over a short run that
    // is the only track record there is time to read.
    const priorDraws = rng.int(PRIOR_HISTORY_MIN, PRIOR_HISTORY_MAX);
    let priorCaught = 0;
    for (let d = 0; d < priorDraws; d++) {
      if (rng.chance(propensity)) priorCaught++;
    }
    contractors[id] = {
      id,
      name,
      reviewed: priorDraws,
      funded: 0,
      caught: priorCaught,
    };
    propensityById[id] = propensity;
  });

  // One crew per trade, so every card's track record is one the player can act on.
  const assignment = shuffle(rng, roster.map((_, i) => `c${i}`));

  interface Slot {
    trade: Trade;
    contractorId: string;
    order: number;
    claimLevel: number;
    overstatement: number;
  }

  const sizes = ladderSizes(rng);
  const slots: Slot[] = [];
  runTrades.forEach((trade, tradeIndex) => {
    const contractorId = assignment[tradeIndex] ?? 'c0';
    const ladder = claimLadder(rng, sizes[tradeIndex] ?? 2);
    ladder.forEach((claimLevel, i) => {
      slots.push({
        trade,
        contractorId,
        claimLevel,
        overstatement: 0,
        // Trades overlap in reality, so jitter the schedule position.
        order: tradeIndex + i / ladder.length + (rng.next() - 0.5) * 1.4,
      });
    });
  });

  // Which draws are inflated is decided over the whole queue rather than rolled per
  // card. Across only five decisions, per-card rolls regularly produce a run with
  // nothing to catch or nothing to fund, and either one is a wasted game. Crews are
  // weighted by propensity so a chronic overstater is still the likely culprit.
  const inflatedCount = rng.int(MIN_INFLATED, MAX_INFLATED);
  // Weights are squared so the chronic crew is clearly the likely culprit. Linear
  // weights left the crew record barely better than a coin flip; going further than
  // this would make "hold everything from the flagged crew" a perfect strategy and
  // the rest of the evidence pointless.
  const pool = slots.map((slot, index) => ({
    index,
    weight: (propensityById[slot.contractorId] ?? CLEAN_PROPENSITY) ** 2,
  }));
  for (let picked = 0; picked < inflatedCount && pool.length > 0; picked++) {
    const total = pool.reduce((sum, c) => sum + c.weight, 0);
    let threshold = rng.next() * total;
    let choice = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      threshold -= pool[i]!.weight;
      if (threshold <= 0) {
        choice = i;
        break;
      }
    }
    const slot = slots[pool[choice]!.index]!;
    // An inflated claim clears the tolerance band decisively rather than landing on
    // the boundary, because a coin-flip card teaches the player nothing.
    slot.overstatement = rng.int(TOLERANCE_PCT + 6, 32);
    pool.splice(choice, 1);
  }

  // Honest partial claims drift a little inside tolerance; an honest closeout does
  // not drift at all, or the last points of the project would be unbuildable.
  for (const slot of slots) {
    if (slot.overstatement === 0 && slot.claimLevel < 100) {
      slot.overstatement = rng.int(0, TOLERANCE_PCT - 4);
    }
  }

  const byTrade = new Map<TradeId, Slot[]>();
  for (const slot of slots) {
    const list = byTrade.get(slot.trade.id) ?? [];
    list.push(slot);
    byTrade.set(slot.trade.id, list);
  }

  // An honest contractor does not bill for the top of a trade before the trade it
  // depends on is underway. Enforcing that here is what makes "out of sequence" a
  // high-precision tell rather than an artifact of how the queue got shuffled:
  // only inflated claims are allowed to jump their prerequisites. The run's trades
  // are a contiguous slice of an already topological list, so prerequisites are
  // settled before their dependents.
  const tradeStart = new Map<TradeId, number>();
  for (const trade of runTrades) {
    const list = byTrade.get(trade.id) ?? [];
    const prereqStart = Math.max(
      0,
      ...trade.requires.map((id) => tradeStart.get(id) ?? 0),
    );
    for (const slot of list) {
      if (slot.claimLevel <= SEQUENCE_CLAIM_MIN) continue;
      const honest = slot.overstatement <= TOLERANCE_PCT;
      if (honest) {
        slot.order = Math.max(slot.order, prereqStart + 0.35);
      } else if (trade.requires.length > 0 && rng.chance(SEQUENCE_JUMP_CHANCE)) {
        // Deliberately bill the top of this trade before the prerequisite has even
        // started. This is the one tell in the game that is close to conclusive.
        slot.order = prereqStart - 0.4;
      }
    }
    tradeStart.set(trade.id, Math.min(...list.map((s) => s.order)));
  }

  slots.sort((a, b) => a.order - b.order);

  // Sorting can reorder a trade's own rungs; reassign them ascending so a trade
  // never bills 100% before its earlier milestone.
  for (const list of byTrade.values()) {
    list.sort((a, b) => a.order - b.order);
    const ascending = list.map((s) => s.claimLevel).sort((a, b) => a - b);
    list.forEach((slot, i) => {
      slot.claimLevel = ascending[i] as number;
    });
  }

  const specs: DrawSpec[] = slots.map((slot, i) => ({
    id: `d${i}`,
    contractorId: slot.contractorId,
    trade: slot.trade,
    claimLevel: slot.claimLevel,
    overstatement: slot.claimLevel >= 100 && slot.overstatement <= TOLERANCE_PCT
      ? 0
      : slot.overstatement,
    resubmits: 0,
    premium: 1,
    noise: Array.from({ length: NOISE_ROLLS }, () => rng.next()),
  }));

  return { seed, facility: FACILITY, trades: runTrades, specs, contractors, propensityById };
}

export interface PreparedDraw {
  spec: DrawSpec;
  contractorName: string;
  /** Percent of this trade the lender has already paid for. Shown on the card. */
  paidPct: number;
  /** Percent verifiably in place. The billing basis. */
  creditedPct: number;
  claimPct: number;
  /** Ground truth. Never rendered before the decision is made. */
  actualPct: number;
  /** Cash requested in $K, before retainage. */
  amount: number;
  inflated: boolean;
  evidence: Evidence[];
}

/**
 * Turn a spec into the card the player actually sees, given the current run state.
 * Pure: the same spec plus the same state always yields the same card.
 */
export function prepareDraw(
  spec: DrawSpec,
  creditedByTrade: Record<TradeId, number>,
  paidByTrade: Record<TradeId, number>,
  contractor: ContractorRecord,
  facility: number,
): PreparedDraw {
  const paidPct = paidByTrade[spec.trade.id];
  const creditedPct = creditedByTrade[spec.trade.id];
  const claimPct = spec.claimLevel;
  // Verified work cannot un-happen, so truth is floored at what is already credited.
  const actualPct = Math.max(creditedPct, claimPct - spec.overstatement);
  const inflated = claimPct - actualPct > TOLERANCE_PCT;
  // Billed against verified work, not against cash already spent. If an earlier
  // inflated claim was funded, that gap shows up here as a second bill.
  const deltaPct = Math.max(0, claimPct - creditedPct);
  const amount = Math.round(
    (deltaPct / 100) * spec.trade.budgetShare * facility * spec.premium,
  );

  const evidence: Evidence[] = [];
  const roll = (index: number): number => spec.noise[index] ?? 1;

  // --- Structural signals: derived from real state, not chance ---

  const laggingPrereq = spec.trade.requires
    .map((id) => ({ id, verified: creditedByTrade[id] }))
    .find((p) => p.verified < SEQUENCE_PREREQ_MAX && claimPct > SEQUENCE_CLAIM_MIN);

  if (laggingPrereq) {
    const prereqName = TRADES.find((t) => t.id === laggingPrereq.id)?.name ?? laggingPrereq.id;
    evidence.push({
      id: 'SEQUENCE_VIOLATION',
      label: 'Out of sequence',
      detail: `${prereqName} is only ${Math.round(laggingPrereq.verified)}% verified`,
      tone: 'bad',
    });
  }

  if (spec.premium > 1) {
    evidence.push({
      id: 'REWORK_PREMIUM',
      label: 'Rework premium',
      detail: `Replacing work already paid for, at ${Math.round((spec.premium - 1) * 100)}% over budget`,
      tone: 'neutral',
    });
  }

  // Context, not an accusation: big jumps are a function of the billing schedule,
  // not of honesty. It is marked neutral so it reads as something to weigh rather
  // than a flag to react to.
  if (deltaPct > 70) {
    evidence.push({
      id: 'OVERSIZED_JUMP',
      label: 'Large jump',
      detail: `${Math.round(deltaPct)} points since the last verified draw`,
      tone: 'neutral',
    });
  }

  // A track record is a rate, not a bit. Everyone slips once, so "has ever been
  // flagged" saturates within a few draws and stops distinguishing anybody. What
  // separates a chronic overstater from an honest crew is how often it happens.
  if (contractor.reviewed >= RECORD_MIN_SAMPLE) {
    const rate = contractor.caught / contractor.reviewed;
    if (rate >= RECORD_BAD_RATE) {
      evidence.push({
        id: 'PRIOR_OVERCLAIM',
        label: 'Chronic overstater',
        detail: `Overstated ${contractor.caught} of ${contractor.reviewed} draws`,
        tone: 'bad',
      });
    } else if (contractor.caught === 0) {
      evidence.push({
        id: 'PRIOR_DRAWS_CLEAN',
        label: 'Clean history',
        detail: `${contractor.reviewed} draws reviewed, none flagged`,
        tone: 'good',
      });
    } else {
      evidence.push({
        id: 'PRIOR_OVERCLAIM',
        label: 'Mixed history',
        detail: `Overstated ${contractor.caught} of ${contractor.reviewed} draws`,
        tone: 'neutral',
      });
    }
  }

  // --- Noisy signals: indicative, never conclusive ---

  const fires = (key: keyof typeof SIGNAL_LIKELIHOOD, index: number): boolean => {
    const l = SIGNAL_LIKELIHOOD[key];
    return roll(index) < (inflated ? l.inflated : l.honest);
  };

  if (fires('INSPECTOR_VERIFIED', 0)) {
    evidence.push({
      id: 'INSPECTOR_VERIFIED',
      label: 'Inspection matches',
      detail: 'Third-party visit confirms the claim',
      tone: 'good',
    });
  }
  if (fires('MATERIALS_ON_SITE', 1)) {
    evidence.push({
      id: 'MATERIALS_ON_SITE',
      label: 'Materials delivered',
      detail: 'Supplier receipts match the scope',
      tone: 'good',
    });
  }
  if (fires('GEO_MISMATCH', 2)) {
    evidence.push({
      id: 'GEO_MISMATCH',
      label: 'Photo off-site',
      detail: `GPS ${(1 + roll(5) * 4).toFixed(1)} mi from the property`,
      tone: 'bad',
    });
  }
  if (fires('PHOTO_STALE', 3)) {
    evidence.push({
      id: 'PHOTO_STALE',
      label: 'Stale photos',
      detail: `Captured ${Math.round(11 + roll(6) * 18)} days ago`,
      tone: 'bad',
    });
  }
  if (fires('LIEN_WAIVER_MISSING', 4)) {
    evidence.push({
      id: 'LIEN_WAIVER_MISSING',
      label: 'Lien waiver missing',
      detail: 'Unsigned conditional waiver on file',
      tone: 'neutral',
    });
  }

  if (evidence.length === 0) {
    evidence.push({
      id: 'PRIOR_DRAWS_CLEAN',
      label: 'Nothing flagged',
      detail: 'Routine submission, no supporting detail',
      tone: 'neutral',
    });
  }

  return {
    spec,
    contractorName: contractor.name,
    paidPct,
    creditedPct,
    claimPct,
    actualPct,
    amount,
    inflated,
    evidence,
  };
}
