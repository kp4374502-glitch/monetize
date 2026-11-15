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

// Editing (unlike creating) has no defaults: a blank field is an error, never a silent reset to 50/1000/100.
const blankIsMissing = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), s);

/** The pay terms and limits editable on a live campaign. Same rules as creation, minus the defaults. */
export const payoutSettingsSchema = z.object({
  baseRate: blankIsMissing(z.coerce.number({ error: "Enter a base rate" }).nonnegative("Base rate cannot be negative")),
  divisor: blankIsMissing(z.coerce.number({ error: "Enter a divisor" }).positive("Divisor must be greater than 0")),
  maxPayPerPost: blankIsMissing(
    z.coerce.number({ error: "Enter a max pay per post" }).nonnegative("Max pay per post cannot be negative"),
  ),
  viewMinimum: blankIsMissing(
    z.coerce.number({ error: "Enter a view minimum" }).int("View minimum must be a whole number").nonnegative("View minimum cannot be negative"),
  ),
  totalBudget: blankIsMissing(z.coerce.number({ error: "Enter a total budget" }).nonnegative("Total budget cannot be negative")),
  dailySubmissionLimit: blankIsMissing(
    z.coerce.number({ error: "Enter a daily submission limit" }).int("Daily limit must be a whole number").positive("Daily limit must be at least 1"),
  ),
});

/** Just the descriptive details. Renaming never touches payout settings, platforms or status. */
export const campaignDetailsSchema = campaignFieldsSchema.pick({ brandName: true, name: true });

export const createCampaignSchema = campaignFieldsSchema;
export const updateCampaignSchema = campaignFieldsSchema;

export type CampaignInput = z.infer<typeof campaignFieldsSchema>;
