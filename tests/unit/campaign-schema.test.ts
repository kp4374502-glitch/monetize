import { describe, expect, it } from "vitest";
import { createCampaignSchema, updateCampaignSchema } from "@/lib/campaigns/schemas";

const base = {
  brandName: "Acme",
  name: "Launch",
  baseRate: 1,
  maxPayPerPost: 500,
  totalBudget: 10000,
  modMarkPaidThreshold: 50,
  eligiblePlatforms: ["tiktok"],
};

describe("campaign input validation", () => {
  it("applies spec defaults (divisor 50, view minimum 1000, daily limit 100)", () => {
    const r = createCampaignSchema.parse(base);
    expect([r.divisor, r.viewMinimum, r.dailySubmissionLimit]).toEqual([50, 1000, 100]);
  });

  it("rejects a negative baseRate", () => {
    expect(createCampaignSchema.safeParse({ ...base, baseRate: -1 }).success).toBe(false);
  });

  it("rejects an empty eligiblePlatforms array", () => {
    expect(createCampaignSchema.safeParse({ ...base, eligiblePlatforms: [] }).success).toBe(false);
  });

  it("rejects an unknown platform", () => {
    expect(createCampaignSchema.safeParse({ ...base, eligiblePlatforms: ["myspace"] }).success).toBe(false);
  });

  it("rejects a zero divisor (would divide by zero in the payout formula)", () => {
    expect(createCampaignSchema.safeParse({ ...base, divisor: 0 }).success).toBe(false);
  });

  it("rejects blank names, negative budget and fractional view minimum", () => {
    expect(createCampaignSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...base, totalBudget: -5 }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...base, viewMinimum: 1.5 }).success).toBe(false);
  });

  it("update uses the same rules", () => {
    expect(updateCampaignSchema.safeParse({ ...base, baseRate: -1 }).success).toBe(false);
    expect(updateCampaignSchema.safeParse(base).success).toBe(true);
  });
});
