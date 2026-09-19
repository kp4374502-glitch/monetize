import { z } from "zod";

export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

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
  modMarkPaidThreshold: money("Mod mark-paid threshold"),
  dailySubmissionLimit: z.coerce.number().int().positive("Daily limit must be at least 1").default(100),
  eligiblePlatforms: z.array(z.enum(PLATFORMS)).min(1, "Select at least one platform"),
});

export const createCampaignSchema = campaignFieldsSchema;
export const updateCampaignSchema = campaignFieldsSchema;

export type CampaignInput = z.infer<typeof campaignFieldsSchema>;
