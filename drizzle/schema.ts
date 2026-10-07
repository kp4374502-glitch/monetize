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
  uniqueIndex,
  index,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

// "awaiting_analytics" (Task 5 Part 3): a pre-review gate, not a terminal status — a clip sits here
// from submission until 7 days have passed since the POST's own publish date AND proof is attached;
// only then does it move to "pending". See lib/clips/rules.ts analyticsGateState.
export const clipStatusEnum = pgEnum("clip_status", ["pending", "approved", "rejected", "awaiting_analytics"]);

export const paidStatusEnum = pgEnum("paid_status", ["unpaid", "paid"]);

export const reviewActionEnum = pgEnum("review_action", [
  "approve",
  "reject",
  "delete",
  "set_posted_at",
  "clip_approve",
  "unlock_analytics_early",
  "edit_rejection_reason",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "clip_approved",
  "clip_rejected",
  "payout_paid",
  "proof_reminder",
  "budget_low",
  "analytics_unlocked",
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
// campaign_brands — unique(userId): a Brand account is scoped to one campaign at a time, same
// shape as campaign_mods. Read-only: never grants review/admin authority, and creator identity is
// never joined into a Brand query (see getBrandClipFeed) rather than merely hidden in the UI.
// ---------------------------------------------------------------------------
export const campaignBrands = pgTable(
  "campaign_brands",
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
    oneCampaignPerBrand: unique("campaign_brands_user_id_unique").on(t.userId),
    campaignIdx: index("campaign_brands_campaign_id_idx").on(t.campaignId),
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
    // Analytics-proof SCREENSHOT (alternative to the video link, only accepted while the clip has < 10,000
    // views). Stored as a PRIVATE Vercel Blob; we keep its pathname, never a public URL. A clip has one
    // proof at a time: setting a screenshot clears the video link and vice versa.
    analyticsScreenshotPathname: text("analytics_screenshot_pathname"),
    analyticsScreenshotSubmittedAt: timestamp("analytics_screenshot_submitted_at", { withTimezone: true }),
    // The clip's view count when the screenshot was accepted — the evidence that it was valid at the time.
    // Never re-checked: later view growth does not invalidate accepted proof.
    analyticsScreenshotViewsAtSubmit: integer("analytics_screenshot_views_at_submit"),
    // ScrapeCreators' own confirmation of content type (its "is_video" field) — Instagram only. null
    // means not yet known (never successfully fetched) or not applicable (TikTok/YouTube posts are
    // always video). false = confirmed photo/carousel, which is what unlocks manual view entry below.
    isVideo: boolean("is_video"),
    // A Mod/Admin/Owner's manually-entered view count, for a confirmed Instagram photo/carousel post
    // where ScrapeCreators has no automatic view number at all (see lib/clips/rules.ts effectiveViews,
    // canSetManualViews). Wins over the auto-fetched `views` everywhere views matter for payout/display.
    // A refresh never touches this — only setManualViews (reviewer-only) does.
    manualViews: integer("manual_views"),
    manualViewsSetBy: text("manual_views_set_by").references(() => users.id),
    manualViewsSetAt: timestamp("manual_views_set_at", { withTimezone: true }),
    cpm: numeric("cpm", { precision: 10, scale: 4 }),
    earnings: numeric("earnings", { precision: 12, scale: 2 }),
    payout: numeric("payout", { precision: 12, scale: 2 }),
    paidStatus: paidStatusEnum("paid_status").notNull().default("unpaid"),
    paidBy: text("paid_by").references(() => users.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    flaggedDuplicate: boolean("flagged_duplicate").notNull().default(false),
    flaggedReason: text("flagged_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete (Owner/Admin only) — never a hard DELETE, so payout math and the audit trail
    // (clip_review_events) for anything ever paid stay intact. A deleted clip is excluded from every
    // list/query app-wide (see lib/clips/rules.ts NOT_DELETED and its call sites).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id),
    // The POST's own real publish date (Task 5 Part 3) — NOT when it was submitted to Monetize.
    // Captured from ScrapeCreators at submission (and filled in on a later refresh if it was missing
    // then), never overwritten once set. null = never successfully captured; see setPostedAt for the
    // Mod/Admin/Owner manual fallback — a null value never silently counts as "7 days have passed".
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedAtSetBy: text("posted_at_set_by").references(() => users.id), // non-null only if a reviewer set it manually
    // Cron dedup: the "you can now submit your analytics proof" notification fires at most once.
    analyticsUnlockNotifiedAt: timestamp("analytics_unlock_notified_at", { withTimezone: true }),
    // Explicit per-clip override: lets a still-gate-locked clip submit proof immediately, regardless
    // of posted_at or the 7-day math (including an unknown posted_at). Distinct from posted_at --
    // never backdates or otherwise touches it, so real post-age data used elsewhere stays accurate.
    // Non-null only if a reviewer (or a one-time ops action) explicitly granted an early unlock.
    analyticsUnlockedEarlyAt: timestamp("analytics_unlocked_early_at", { withTimezone: true }),
    analyticsUnlockedEarlyBy: text("analytics_unlocked_early_by").references(() => users.id),
    // Optional per-post Base Rate that wins over campaigns.base_rate. Null = follow the campaign's
    // current rate (the normal case). Used to pin posts to the rate they were submitted under when
    // a campaign's rate later changes, so a rate change applies going forward only (see PRODUCT_SPEC).
    baseRateOverride: numeric("base_rate_override", { precision: 10, scale: 4 }),
    // Two-step approval: a pure content/eligibility check (guidelines, brand integration, CTA) —
    // independent of `status`, the 7-day analytics gate, and payout math. Settable any time,
    // including while still `awaiting_analytics` and before any proof exists. Never reset by a
    // later Analytics-stage reject — it records that the content passed, not the final outcome; a
    // clip can be `clip_approved = true` and `status = 'rejected'` at the same time (no payout
    // either way; see setQualifyingAudiencePct / reviewClip for the actual payout-determining step).
    clipApproved: boolean("clip_approved").notNull().default(false),
    clipApprovedAt: timestamp("clip_approved_at", { withTimezone: true }),
    clipApprovedBy: text("clip_approved_by").references(() => users.id),
  },
  (t) => ({
    // Partial (not table-level unique): a deleted clip's URL frees up for resubmission — EXCEPT a
    // clip that was ever paid, which keeps its URL permanently blocked even after deletion, so a
    // paid-then-deleted clip can never be resubmitted and re-earned. See lib/clips/service.ts deleteClip.
    noDuplicateUrlPerCampaign: uniqueIndex("clips_campaign_url_unique")
      .on(t.campaignId, t.url)
      .where(sql`${t.deletedAt} is null or ${t.paidStatus} = 'paid'`),
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
    // Mirrors clips.is_video — a cache hit must be able to fully populate a clip, including this flag.
    isVideo: boolean("is_video"),
    // Mirrors clips.posted_at — the post's real publish date (Task 5 Part 3).
    postedAt: timestamp("posted_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Public post data, deliberately not tenant-scoped; one row per (platform, url) for upserts.
    onePerUrl: unique("scrapecreators_cache_platform_url_unique").on(t.platform, t.url),
  }),
);

// ---------------------------------------------------------------------------
// brand_requests — a signed-up user asking to become a brand. NOT tenant/campaign data: it is a
// platform-level queue the platform Owner reviews by hand. Approval grants no power by itself; it
// only makes the user assignable as a campaign's owner (campaigns.owner_user_id, transferable).
// ---------------------------------------------------------------------------
export const brandRequestStatusEnum = pgEnum("brand_request_status", ["pending", "approved", "rejected"]);

export const brandRequests = pgTable(
  "brand_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id)
      .unique(),
    brandName: text("brand_name").notNull(),
    discord: text("discord").notNull(),
    note: text("note"),
    status: brandRequestStatusEnum("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("brand_requests_status_idx").on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// brand_signup_attempts — failed guesses at the shared BRAND_SIGNUP_CODE, for per-IP lockout
// ---------------------------------------------------------------------------
export const brandSignupAttempts = pgTable(
  "brand_signup_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ipTimeIdx: index("brand_signup_attempts_ip_created_idx").on(t.ip, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// creator_profiles — filled in by the self-serve creator onboarding (/sign-up -> /onboarding). One row
// per user, NOT campaign-scoped: it describes the person, not their work on any campaign. Accounts made
// before self-signup existed (or through an invite link before onboarding shipped) have no row.
// ---------------------------------------------------------------------------
export const creatorTypeEnum = pgEnum("creator_type", ["faceless", "face"]);

export type CreatorSocial = { platform: string; handle: string; language: string };

export const creatorProfiles = pgTable("creator_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthday: date("birthday").notNull(),
  gender: text("gender").notNull(),
  country: text("country").notNull(),
  phoneCountryCode: text("phone_country_code").notNull(),
  phoneNumber: text("phone_number").notNull(),
  creatorType: creatorTypeEnum("creator_type").notNull(),
  socials: jsonb("socials").$type<CreatorSocial[]>().notNull().default([]),
  showcaseUrls: text("showcase_urls").array().notNull().default(sql`'{}'::text[]`),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
  // Set when the creator clicks "Join Community". The app can't see Discord, so this records the click,
  // not a confirmed membership.
  discordJoinClickedAt: timestamp("discord_join_clicked_at", { withTimezone: true }),
  // Set by the final onboarding step; null means onboarding is unfinished and / sends them back to it.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
