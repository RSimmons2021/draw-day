export type TradeId =
  | 'sitework'
  | 'foundation'
  | 'framing'
  | 'envelope'
  | 'mep'
  | 'drywall'
  | 'finishes'
  | 'punch';

export interface Trade {
  id: TradeId;
  name: string;
  /** Trades that must be substantially underway before this one can credibly progress. */
  requires: readonly TradeId[];
  /** Share of the total project budget, 0..1. All shares sum to 1. */
  budgetShare: number;
}

export type EvidenceId =
  | 'INSPECTOR_VERIFIED'
  | 'MATERIALS_ON_SITE'
  | 'PRIOR_DRAWS_CLEAN'
  | 'SEQUENCE_VIOLATION'
  | 'GEO_MISMATCH'
  | 'PHOTO_STALE'
  | 'OVERSIZED_JUMP'
  | 'LIEN_WAIVER_MISSING'
  | 'PRIOR_OVERCLAIM'
  | 'REWORK_PREMIUM';

export type EvidenceTone = 'good' | 'bad' | 'neutral';

export interface Evidence {
  id: EvidenceId;
  label: string;
  detail: string;
  tone: EvidenceTone;
}

export interface ContractorRecord {
  id: string;
  name: string;
  /** Draws from this contractor the player has ruled on. */
  reviewed: number;
  /** Draws this contractor has had funded. */
  funded: number;
  /** Times this contractor has been shown to be overstating. */
  caught: number;
}

export type Decision = 'fund' | 'hold';

export interface DecisionLog {
  drawId: string;
  tradeName: string;
  contractorName: string;
  decision: Decision;
  correct: boolean;
  /** Cash released, in $K. Zero for a hold. */
  released: number;
  /** Completion percentage points actually earned. */
  progress: number;
  claimPct: number;
  actualPct: number;
}

export type GameStatus = 'running' | 'won' | 'lost';

export type LossReason = 'underwater' | 'walkoff' | 'facility' | 'stalled';

export interface GameState {
  seed: string;
  status: GameStatus;
  lossReason: LossReason | null;
  /** Total loan facility in $K. */
  facility: number;
  /** Cash released to date in $K. */
  disbursed: number;
  /** Retainage withheld to date in $K — released at closeout. */
  retainage: number;
  /** True project completion, 0..100. */
  completion: number;
  /** Contractor goodwill, 0..100. At zero the crew walks off. */
  trust: number;
  /**
   * Percent of each trade the lender has paid for. Diverges from `creditedByTrade`
   * as soon as an inflated claim gets funded: the money is gone but the work is not
   * in place, so it has to be bought a second time.
   */
  paidByTrade: Record<TradeId, number>;
  /** Percent of each trade verifiably in place. Drives completion and pricing. */
  creditedByTrade: Record<TradeId, number>;
  contractors: Record<string, ContractorRecord>;
  log: DecisionLog[];
}
