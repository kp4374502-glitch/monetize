/**
 * The payout formula, per docs/PRODUCT_SPEC.md -> "Payout formula".
 *   CPM      = min(Qualifying Audience % / Divisor, 1) * Base Rate
 *   Earnings = CPM * (Views / 1000)
 *   Payout   = min(Earnings, Max Pay Per Post)
 *
 * Base Rate is the CEILING on CPM, reached once the audience % hits the Divisor (the qualifying
 * threshold). Below it, CPM scales proportionally exactly as before. At or above it, CPM stays flat
 * at Base Rate — 78% with a 50 Divisor is not worth more than 100% with the same Divisor.
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

  const cpm = Math.min(qualifyingAudiencePct / divisor, 1) * baseRate;
  const earnings = cpm * (views / 1000);
  const payout = Math.min(earnings, maxPayPerPost);

  return { cpm, earnings, payout };
}
