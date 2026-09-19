/**
 * The payout formula, per docs/PRODUCT_SPEC.md -> "Payout formula".
 *   CPM      = (Qualifying Audience % / Divisor) * Base Rate
 *   Earnings = CPM * (Views / 1000)
 *   Payout   = min(Earnings, Max Pay Per Post)
 */
export interface PayoutInputs {
  qualifyingAudiencePct: number;
  divisor: number;
  baseRate: number;
  views: number;
  maxPayPerPost: number;
}

export interface PayoutResult {
  cpm: number;
  earnings: number;
  payout: number;
}

export function calculatePayout(inputs: PayoutInputs): PayoutResult {
  const { qualifyingAudiencePct, divisor, baseRate, views, maxPayPerPost } = inputs;

  if (divisor <= 0) throw new Error("Divisor must be greater than zero.");

  const cpm = (qualifyingAudiencePct / divisor) * baseRate;
  const earnings = cpm * (views / 1000);
  const payout = Math.min(earnings, maxPayPerPost);

  return { cpm, earnings, payout };
}
