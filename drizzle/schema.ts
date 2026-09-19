import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  integer,
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const campaignStatusEnum = pgEnum("campaign_status", [
  "active",
  "paused",
  "closed",
  "archived",
]);

export const platformEnum = pgEnum("platform", ["tiktok", "instagram", "youtube"]);

export const clipStatusEnum = pgEnum("clip_status", ["pending", "approved", "rejected"]);

export const paidStatusEnum = pgEnum("paid_status", ["unpaid", "paid"]);

export const reviewActionEnum = pgEnum("review_action", ["approve", "reject"]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "clip_approved",
  "clip_rejected",
  "payout_paid",
  "proof_reminder",
  "budget_low",
]);

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID (e.g. user_2abc...) — single source of identity
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash"), // unused: Clerk owns credentials
  isPlatformOwner: boolean("is_platform_owner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// campaigns
// ---------------------------------------------------------------------------
export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandName: text("brand_name").notNull(),
  name: text("name").notNull(),
  status: campaignStatusEnum("status").notNull().default("active"),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id),
  baseRate: numeric("base_rate", { precision: 10, scale: 4 }).notNull(),
  divisor: numeric("divisor", { precision: 10, scale: 4 }).notNull().default("50"),
  maxPayPerPost: numeric("max_pay_per_post", { precision: 10, scale: 2 }).notNull(),
  viewMinimum: integer("view_minimum").notNull().default(1000),
  totalBudget: numeric("total_budget", { precision: 12, scale: 2 }).notNull(),
  budgetSpent: numeric("budget_spent", { precision: 12, scale: 2 }).notNull().default("0"),
  modMarkPaidThreshold: numeric("mod_mark_paid_threshold", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  dailySubmissionLimit: integer("daily_submission_limit").notNull().default(100),
  eligiblePlatforms: platformEnum("eligible_platforms").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// platform_admins — presence here = Admin, active on every campaign implicitly
// ---------------------------------------------------------------------------
export const platformAdmins = pgTable("platform_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
});

// ---------------------------------------------------------------------------
// campaign_mods — unique(userId): a Mod works one campaign at a time
// ---------------------------------------------------------------------------
export const campaignMods = pgTable(
  "campaign_mods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    addedBy: text("added_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneCampaignPerMod: unique("campaign_mods_user_id_unique").on(t.userId),
    campaignIdx: index("campaign_mods_campaign_id_idx").on(t.campaignId),
  }),
);

// ---------------------------------------------------------------------------
// campaign_creators
// ---------------------------------------------------------------------------
export const campaignCreators = pgTable(
  "campaign_creators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    inviteLinkId: uuid("invite_link_id").references(() => inviteLinks.id),
    suspended: boolean("suspended").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneRowPerCreatorPerCampaign: unique("campaign_creators_campaign_user_unique").on(
      t.campaignId,
      t.userId,
    ),
    campaignIdx: index("campaign_creators_campaign_id_idx").on(t.campaignId),
  }),
);

// ---------------------------------------------------------------------------
// invite_links
// ---------------------------------------------------------------------------
export const inviteLinks = pgTable("invite_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  code: text("code").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// clips
// ---------------------------------------------------------------------------
export const clips = pgTable(
  "clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => users.id),
    platform: platformEnum("platform").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    caption: text("caption"),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    status: clipStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    qualifyingAudiencePct: numeric("qualifying_audience_pct", { precision: 5, scale: 2 }),
    qualifyingPctSetBy: text("qualifying_pct_set_by").references(() => users.id),
    videoProofUrl: text("video_proof_url"),
    videoProofSubmittedAt: timestamp("video_proof_submitted_at", { withTimezone: true }),
    videoProofReminderSentAt: timestamp("video_proof_reminder_sent_at", { withTimezone: true }),
    cpm: numeric("cpm", { precision: 10, scale: 4 }),
    earnings: numeric("earnings", { precision: 12, scale: 2 }),
    payout: numeric("payout", { precision: 12, scale: 2 }),
    paidStatus: paidStatusEnum("paid_status").notNull().default("unpaid"),
    paidBy: text("paid_by").references(() => users.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    flaggedDuplicate: boolean("flagged_duplicate").notNull().default(false),
    flaggedReason: text("flagged_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    noDuplicateUrlPerCampaign: unique("clips_campaign_url_unique").on(t.campaignId, t.url),
    reviewQueueIdx: index("clips_campaign_status_idx").on(t.campaignId, t.status),
    dailyLimitIdx: index("clips_campaign_creator_submitted_idx").on(
      t.campaignId,
      t.creatorUserId,
      t.submittedAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// clip_review_events — audit log, supports multi-round review
// ---------------------------------------------------------------------------
export const clipReviewEvents = pgTable("clip_review_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clipId: uuid("clip_id")
    .notNull()
    .references(() => clips.id),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => users.id),
  action: reviewActionEnum("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    clipId: uuid("clip_id").references(() => clips.id),
    type: notificationTypeEnum("type").notNull(),
    message: text("message").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bellIdx: index("notifications_user_read_idx").on(t.userId, t.read),
  }),
);

// ---------------------------------------------------------------------------
// scrapecreators_cache — optional cost-saving cache
// ---------------------------------------------------------------------------
export const scrapeCreatorsCache = pgTable(
  "scrapecreators_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: platformEnum("platform").notNull(),
    url: text("url").notNull(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull(),
    // Task 3: added so a cache hit can fully populate a clip (thumbnail/caption) without an API call.
    thumbnailUrl: text("thumbnail_url"),
    caption: text("caption"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Public post data, deliberately not tenant-scoped; one row per (platform, url) for upserts.
    onePerUrl: unique("scrapecreators_cache_platform_url_unique").on(t.platform, t.url),
  }),
);
