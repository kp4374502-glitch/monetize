# Database Schema — Monetize Clips

Every table holding campaign-specific data carries a `campaign_id` — this is the tenant boundary. Nothing campaign-scoped is ever queried without filtering on it.

## users

- `id` (pk)
- `username` (unique, locked after signup)
- `password_hash`
- `is_platform_owner` (boolean — exactly one row is `true`)
- `created_at`

## campaigns

- `id` (pk)
- `brand_name`, `name`
- `status` (active | paused | closed | archived)
- `owner_user_id` (fk users — transferable)
- `base_rate`, `divisor` (default 50), `max_pay_per_post`
- `view_minimum`
- `total_budget`, `budget_spent` (running total)
- `mod_mark_paid_threshold`
- `daily_submission_limit` (default 100)
- `eligible_platforms` (array: tiktok, instagram, youtube)
- `created_at`, `closed_at`

## platform\_admins

- `user_id` (pk, fk users) — presence here = Admin, automatically active on every campaign, no per-campaign row needed

## campaign\_mods

- `id` (pk)
- `campaign_id` (fk campaigns)
- `user_id` (fk users)
- `unique(user_id)` — enforces "one Mod account works on only one campaign as Mod at a time"
- `added_by` (fk users), `created_at`

## campaign\_brands

Read-only per-campaign viewer role ("Brand" — unrelated to the `brand_requests` "approved brand" concept below). Added directly by username by Owner/Admin, same as a Mod, no invite link.

- `id` (pk)
- `campaign_id` (fk campaigns)
- `user_id` (fk users)
- `unique(user_id)` — enforces "one Brand account works on only one campaign at a time", same shape as campaign\_mods
- `added_by` (fk users), `created_at`

## campaign\_creators

- `id` (pk)
- `campaign_id` (fk campaigns)
- `user_id` (fk users)
- `invite_link_id` (fk invite\_links)
- `suspended` (boolean)
- `joined_at`
- `unique(campaign_id, user_id)` — a creator can join many campaigns, but only once each

## invite\_links

- `id` (pk)
- `campaign_id` (fk campaigns)
- `code` (unique)
- `created_by` (fk users — Owner or Mod)
- `revoked` (boolean)
- `created_at`

## clips

- `id` (pk)
- `campaign_id` (fk campaigns)
- `creator_user_id` (fk users)
- `platform` (tiktok | instagram | youtube)
- `url`, partial `unique(campaign_id, url) where deleted_at is null or paid_status = 'paid'` — blocks
  exact-duplicate submission by the same creator; frees up once the clip is soft-deleted, UNLESS it
  was ever paid, in which case the URL stays blocked forever (see below)
- `thumbnail_url`, `caption`
- `views`, `likes`, `last_refreshed_at` (kept in sync via ScrapeCreators)
- `is_video` (nullable bool; ScrapeCreators' own confirmation, Instagram-specific — `false` means a
  confirmed photo/carousel with no automatic view data; `null` = not yet known or not applicable)
- `manual_views` (nullable int, reviewer-entered view count; only settable when `is_video = false` —
  see PRODUCT_SPEC.md "Manual view entry"), `manual_views_set_by` (fk users, nullable),
  `manual_views_set_at` (nullable). Wins over `views` everywhere views matter for payout/display; a
  refresh never touches these three columns.
- `status` (pending | approved | rejected | awaiting_analytics — the last is Task 5 Part 3's pre-review
  gate, not a terminal status; see PRODUCT_SPEC.md "Tier 1 audience verification")
- `rejection_reason` (nullable, shown to the creator)
- `qualifying_audience_pct` (nullable, entered by Admin/Mod)
- `qualifying_pct_set_by` (fk users)
- `video_proof_url`, `video_proof_submitted_at` (nullable, can be submitted early or replaced)
- `video_proof_reminder_sent_at` (nullable)
- `analytics_screenshot_pathname` (nullable, Vercel Blob pathname of an already-accepted proof screenshot; mutually exclusive with `video_proof_url` — a clip holds one proof at a time), `analytics_screenshot_submitted_at` (nullable), `analytics_screenshot_views_at_submit` (nullable int, the views recorded at submission — evidence it was valid when submitted). **Task 5 Part 2: new screenshot submission was removed** — nothing writes a new value into these three columns anymore, but existing values are read and honored exactly as before (see PRODUCT_SPEC.md "Tier 1 audience verification").
- `cpm`, `earnings`, `payout` (computed and cached)
- `paid_status` (unpaid | paid)
- `paid_by` (fk users, nullable), `paid_at` (nullable)
- `flagged_duplicate` (boolean), `flagged_reason` (nullable, manual review flag for cross-creator theft)
- `submitted_at`
- `deleted_at` (nullable), `deleted_by` (fk users, nullable) — soft delete, Owner/Admin only, any
  status. Excluded from every list/query app-wide; never a hard `DELETE` (see PRODUCT_SPEC.md
  "Clip deletion"). Payout/audit data on the row itself is untouched.
- `posted_at` (nullable; Task 5 Part 3) — the post's own real publish date, captured from
  ScrapeCreators at submission (filled in later on a refresh if it was missing then); never
  overwritten once set. `posted_at_set_by` (fk users, nullable) — non-null only if a Mod/Admin/Owner
  set it manually because ScrapeCreators never returned one (see `setPostedAt`; a null `posted_at`
  never counts as "7 days have passed" either way).
- `analytics_unlock_notified_at` (nullable) — cron dedup for the "you can now submit proof"
  notification, fired at most once per clip.
- `clip_approved` (boolean, default false) — two-step approval: a pure content/eligibility check
  (guidelines, brand integration, CTA), fully independent of `status` and the 7-day gate, and never
  a payout signal — payout is only ever set via the Analytics Approve flow. Settable any time,
  including while still `awaiting_analytics` and before proof exists. Admin/Owner only. Never reset
  by a later Analytics-stage reject, so a clip can be `clip_approved = true` and `status = 'rejected'`
  at the same time — see PRODUCT_SPEC.md "Two-step approval". `clip_approved_at`/`clip_approved_by`
  (fk users, nullable) record when and by whom.

## clip\_review\_events

- `id` (pk)
- `clip_id` (fk clips)
- `actor_user_id` (fk users)
- `action` (approve | reject | delete | set_posted_at | clip_approve)
- `reason` (nullable; for a delete, records the clip's prior status)
- `created_at`

Supports multi-round review (a clip can be approved, later reverted, re-approved) and gives Admin/Owner the audit log/history they're entitled to see.

## notifications

- `id` (pk)
- `user_id` (fk users, recipient)
- `campaign_id`, `clip_id` (nullable)
- `type` (clip\_approved | clip\_rejected | payout\_paid | proof\_reminder | budget\_low | analytics\_unlocked)
- `message`
- `read` (boolean)
- `created_at`

## scrapecreators\_cache (cost-saving, optional)

- `id` (pk)
- `platform`, `url`
- `views`, `likes`
- `fetched_at`

## Relationships summary

- One `platform_owner` (flag on `users`, not a separate table)
- `users` —< `campaign_mods` >— `campaigns` (join table; unique(user\_id) keeps a Mod on exactly one campaign)
- `users` —< `campaign_brands` >— `campaigns` (join table; unique(user\_id) keeps a Brand viewer on exactly one campaign, same as Mod)
- `users` —< `campaign_creators` >— `campaigns` (join table; unlimited campaigns per creator)
- `campaigns` 1—1 `owner_user_id`
- `campaigns` 1—< `clips`
- `clips` 1—< `clip_review_events`
- `clips` 1—1 `creator_user_id`

## Business-rule notes

- **Daily submission limit:** enforced with a rolling count against `clips.submitted_at` per `(campaign_id, creator_user_id)`, compared to `campaigns.daily_submission_limit`.
- **Budget cap:** before approving or marking a clip paid, check `campaigns.budget_spent + clip.payout <= campaigns.total_budget`.
- **Mod pay threshold:** a Mod may set `paid_status = paid` only when `clip.payout <= campaigns.mod_mark_paid_threshold`; above it, the write is rejected unless the actor is Admin or Owner.
- **Admin scope:** Admin authority is computed as "is this user in `platform_admins`?" — no join against `campaign_mods` needed, since it applies to every campaign implicitly.