import { describe, expect, it } from "vitest";
import { NO_ANALYTICS_QUALIFYING_PCT, computeEconomics } from "@/lib/clips/rules";

// Efootball Diwali's real settings: base rate $0.10, divisor 50, max $1,000 per post, view minimum 1.
const efootball = { baseRate: 0.1, divisor: 50, maxPayPerPost: 1000, viewMinimum: 1, requireAnalyticsProof: false };
const noProof = { videoProofUrl: null, analyticsScreenshotPathname: null, qualifyingAudiencePct: null };

describe("computeEconomics for a campaign that does not use analytics", () => {
  it("prices every post at a fixed 100% audience, which lands on the Base Rate ceiling", () => {
    expect(NO_ANALYTICS_QUALIFYING_PCT).toBe(100);
    // CPM = min(100 / 50, 1) x $0.10 = $0.10 (Base Rate is the ceiling); 100,000 views = 100 x $0.10 = $10.00
    expect(computeEconomics({ ...noProof, views: 100_000, campaign: efootball })).toEqual({
      eligible: true,
      cpm: "0.1000",
      earnings: "10.00",
      payout: "10.00",
    });
  });

  it("a divisor above 100 means 100% is no longer enough to reach the ceiling", () => {
    // min(100 / 200, 1) x $0.10 = $0.05 CPM; 100,000 views = $5.00
    expect(computeEconomics({ ...noProof, views: 100_000, campaign: { ...efootball, divisor: 200 } })).toMatchObject({ cpm: "0.0500", payout: "5.00" });
  });

  it("needs neither proof nor a Qualifying Audience %", () => {
    const r = computeEconomics({ ...noProof, views: 5_000, campaign: efootball });
    expect(r.eligible).toBe(true);
  });

  it("ignores a % that was entered earlier, so it can never change the price", () => {
    const withPct = computeEconomics({ ...noProof, qualifyingAudiencePct: 10, views: 100_000, campaign: efootball });
    const without = computeEconomics({ ...noProof, views: 100_000, campaign: efootball });
    expect(withPct).toEqual(without);
  });

  it("still caps at Max Pay Per Post", () => {
    // 20,000,000 views would earn $2,000.00 -> capped at $1,000.00
    expect(computeEconomics({ ...noProof, views: 20_000_000, campaign: efootball })).toMatchObject({
      earnings: "2000.00",
      payout: "1000.00",
    });
  });

  it("still enforces the View Minimum", () => {
    const campaign = { ...efootball, viewMinimum: 1000 };
    expect(computeEconomics({ ...noProof, views: 999, campaign })).toEqual({ eligible: false, reason: "below_view_minimum" });
    expect(computeEconomics({ ...noProof, views: 1000, campaign }).eligible).toBe(true);
  });

  it("rounds earnings to cents and keeps CPM at 4 decimals", () => {
    // 12,345 views x $0.10 CPM = $1.2345 -> $1.23
    expect(computeEconomics({ ...noProof, views: 12_345, campaign: efootball })).toMatchObject({ cpm: "0.1000", earnings: "1.23", payout: "1.23" });
  });
});

describe("computeEconomics for a campaign that does use analytics (unchanged behaviour)", () => {
  const proofCampaign = { baseRate: 0.1, divisor: 50, maxPayPerPost: 1000, viewMinimum: 1 };

  it("earns nothing without proof or without a %, exactly as before", () => {
    expect(computeEconomics({ ...noProof, views: 100_000, campaign: proofCampaign })).toEqual({ eligible: false, reason: "no_proof" });
    expect(
      computeEconomics({ ...noProof, videoProofUrl: "https://youtu.be/abcdefghijk", views: 100_000, campaign: proofCampaign }),
    ).toEqual({ eligible: false, reason: "no_pct" });
  });

  it("treats an explicit requireAnalyticsProof: true the same as leaving it out", () => {
    expect(computeEconomics({ ...noProof, views: 100_000, campaign: { ...proofCampaign, requireAnalyticsProof: true } })).toEqual({
      eligible: false,
      reason: "no_proof",
    });
  });

  it("uses the entered % when proof exists", () => {
    // 50% -> CPM = (50 / 50) x $0.10 = $0.10; 100,000 views = $10.00
    expect(
      computeEconomics({ ...noProof, videoProofUrl: "https://youtu.be/abcdefghijk", qualifyingAudiencePct: 50, views: 100_000, campaign: proofCampaign }),
    ).toMatchObject({ cpm: "0.1000", payout: "10.00" });
  });
});
