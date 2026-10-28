import { z } from "zod";

export const PLATFORMS = ["tiktok", "instagram", "youtube", "x"] as const;

export const PLATFORM_LABELS: Record<(typeof PLATFORMS)[number], string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
};

/** The set of platforms a campaign accepts posts from. At least one. */
export const eligiblePlatformsSchema = z.array(z.enum(PLATFORMS)).min(1, "Select at least one platform");

const money = (label: string) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .nonnegative(`${label} cannot be negative`);

export const campaignFieldsSchema = z.object({
  brandName: z.string().trim().min(1, "Brand name is required"),
  name: z.string().trim().min(1, "Campaign name is required"),
  baseRate: money("Base rate"),
  divisor: z.coerce.number().positive("Divisor must be greater than 0").default(50),
  maxPayPerPost: money("Max pay per post"),
  viewMinimum: z.coerce.number().int("View minimum must be a whole number").nonnegative().default(1000),
  totalBudget: money("Total budget"),
  // Retired: only Owner/Admin mark paid now. The column stays (additive-only schema) and is always stored as 0.
  modMarkPaidThreshold: money("Mod mark-paid threshold").default(0),
  dailySubmissionLimit: z.coerce.number().int().positive("Daily limit must be at least 1").default(100),
  eligiblePlatforms: eligiblePlatformsSchema,
});

export const createCampaignSchema = campaignFieldsSchema;
export const updateCampaignSchema = campaignFieldsSchema;

export type CampaignInput = z.infer<typeof campaignFieldsSchema>;
