# Monetize — Product & Technical Spec

2026-09-18 · Compiled with @Someone

## Overview

Monetize is a multi-tenant platform for running paid TikTok/Instagram/YouTube clipping campaigns: creators submit links to clips they've posted, a reviewer verifies view counts and audience quality, and the platform tracks what each creator has earned. The platform itself is free — no fee is taken from any campaign.

Each brand runs its own **campaign** with its own payout formula, review team, and creator roster. Payouts are calculated and tracked in-app, but the actual money changes hands manually on Discord — the app is a ledger and review tool, not a payment processor.

## Multi-tenancy & campaigns

- The platform supports many brands, each running one or more campaigns, at a target scale of **thousands of accounts across many campaigns**.
- **Onboarding is not self-serve.** A new brand does not sign up and immediately get a campaign — the platform super admin (Owner) manually reviews and approves each new brand before their campaign goes live.
- Every campaign has its own independent configuration:
  - Payout formula parameters (Base Rate, Divisor, Max Pay Per Post, View Minimum, Total Budget — see Payout formula)
  - Its own roster of creators, reviewers (Admins/Mods), and clips
  - Its own submission rate limits and review queue
- Creators, clips, and earnings are scoped to a single campaign — a creator's activity in one campaign is invisible to another campaign unless they are separately added to it.
- **One shared app,** not per-brand subdomains — users get a campaign switcher inside a single app (similar to switching Slack workspaces).
- **Admin/Mod assignment:** the campaign Owner adds an Admin or Mod directly by username — no invite link for these roles (invite links are for Creators only).

## Roles & permissions

Four roles exist, and each exists in two scopes — **platform-wide** (applies across every campaign) and **per-campaign** (applies only within one Owner's campaign). One person can hold multiple roles at once (e.g. a Campaign Owner who is also a Creator elsewhere).

| Role | Platform-wide scope | Per-campaign scope |
| --- | --- | --- |
| Owner | Approves new brands onto the platform | Owns a campaign: sets payout formula, roster, review team |
| Admin | Cross-campaign oversight/support | Full review powers within one campaign |
| Mod | Cross-campaign moderation support | Reviews and approves/rejects clips within one campaign |
| Creator | — | Submits clips, uploads proof, views own stats only |

**Data isolation:** creators cannot see any other creator's clips, views, or earnings — not even within the same campaign.

### Admin permissions (detailed)

A platform-wide **Admin is a strict superset of Mod** — anything a Mod can do, an Admin can do, plus more. Admins are automatically active on **every** campaign (no per-campaign assignment needed, and no limit on how many they cover).

**Campaigns**

- Cannot create a new campaign — that's Owner-only. An Admin manages a campaign once the Owner has created it.
- Can pause, close, or archive a campaign.
- Can edit campaign payout settings (Base Rate, Divisor, Max Pay Per Post, View Minimum, Total Budget) — same authority as the Owner.

**People**

- Can add or remove Mods.
- Can add or remove other Admins.
- Can generate and revoke creator invite links.
- Can remove/ban a creator from a campaign.
- Can change anyone's role (promote/demote Creator ↔ Mod ↔ Admin).
- The **Owner**, in turn, can remove or demote an Admin.

**Clip review**

- Can override a Mod's decision (re-approve something rejected, or reverse an approval).
- Can edit a Qualifying Audience % that a Mod already entered.

**Money**

- Can mark a clip "Mark paid" — not Owner-exclusive.

**New-brand approval**

- Cannot approve new brands onto the platform — that stays strictly **Owner-only**.

**Visibility & oversight**

- Sees financial totals (earned/owed) **across all campaigns**, not just ones they're active on.
- Gets a full audit log / history of who approved, rejected, or edited what.
- Can see other reviewers' activity (clips processed per Mod, review speed).
- Gets a **cross-campaign dashboard** — an aggregated view across every brand, not a one-campaign-at-a-time view like a Mod's.

### Mod permissions (detailed)

Unlike Admin, a Mod is **not** automatic across campaigns — they must be explicitly added to each one, and a single Mod account works on only **one campaign at a time** (no multi-campaign Mod assignment). There's no cap on how many Mods a single campaign can have. Despite being scoped to one campaign for review duties, a Mod **can still view** clips/creators in campaigns they aren't assigned to — that read visibility isn't restricted the way review authority is.

**People**

- Can generate and revoke creator invite links.
- Cannot remove/ban a creator.
- Cannot add or remove other Mods.
- Cannot change anyone's role.
- An Admin can remove or demote a Mod.

**Clip review**

- Cannot override another Mod's approve/reject decision on the same clip.
- Cannot edit a Qualifying Audience % that a different Mod already entered.
- A Mod's approve/reject decision is final on its own — but an Admin can review and change it afterward.

**Campaign & money**

- Cannot edit campaign payout settings (Base Rate, Divisor, Max Pay, View Minimum, Total Budget).
- Cannot pause or close a campaign.
- Can mark a clip "Mark paid" **only up to the campaign's Mod Mark-Paid Threshold**; above that dollar amount, only Admin/Owner can mark it paid.
- Can see the campaign's financial totals (earned/owed).
- Can see the campaign's remaining Total Budget.

**Visibility & multi-role**

- Cannot see other Mods' review activity or speed.
- One person can be a Mod on one campaign and a Creator on a different campaign at the same time.
- Dashboard is the same style as Admin's (the original Liftly reviewer view — "X waiting on you," creator roster, clip feed), just scoped to their one assigned campaign rather than aggregated across all.

### Owner permissions (detailed)

**Platform level**

- There is exactly **one** platform-wide Owner — no multiple platform Owners.
- The platform Owner creates each campaign on behalf of the brand themselves (not the brand's own staff).
- Can remove/ban an entire brand and its campaign from the platform.
- Sees financial totals across every campaign on the platform.

**Campaign level**

- Exactly one Owner per campaign.
- Campaign ownership can be transferred to someone else, though this is an occasional action rather than a routine one.
- Can delete, pause, or close a campaign at will.
- A closed/archived campaign can be reopened by the Owner.

**People**

- Can remove/ban a creator directly, same as Admin.
- Can remove or demote an Admin.
- There's no people-management action Admin can do that Owner can't — Owner is at least as capable here.

**Clip review**

- Same review powers as Admin: can override a Mod's decision and edit a Qualifying Audience % already entered.
- Can see everyone's individual review speed/activity, same as Admin.

**Money**

- Can mark any clip paid regardless of amount — the Mod Mark-Paid Threshold doesn't apply to Owner (or Admin).
- Gets an alert when a campaign's Total Budget is close to running out.
- Can reverse/undo a "Mark paid" status if it was marked by mistake.

**Settings**

- Beyond the payout parameters, the Owner also configures campaign name/branding and which social platforms (TikTok/Instagram/YouTube) are eligible for submission on that campaign.
- Can change the campaign's daily submission rate limit (default 100, adjustable per campaign).

**Oversight**

- Gets the same cross-campaign dashboard as Admin when they own multiple campaigns.
- Nothing a platform Admin can do exceeds what the Owner can do — Owner is the top authority.

### Creator permissions (detailed)

**Account & multi-campaign**

- A single creator account can join multiple campaigns (via separate invite links); they use the same **campaign switcher** as reviewers to move between them.
- Username is locked after signup, not editable.
- **Ownership verification:** no OAuth or bio-code step at submission — relies entirely on the existing manual review (Admin/Mod catches non-owned links via duplicate/stolen-link flagging, see Fraud prevention).

**Submitting clips**

- Exact-duplicate link submissions from the same creator are blocked by the system.
- A creator can only delete and resubmit a clip to change its details — no in-place editing of a submitted link.
- Cannot delete/withdraw their own clip once submitted.
- Once a clip is rejected, the creator **cannot** resubmit the same link again.
- No minimum wait before a clip is eligible for review — a reviewer can review it immediately regardless of current view count (though it won't earn anything until it clears the campaign's View Minimum).

**Proof submission**

- Dashboard shows a visible countdown/reminder for when the 7-day analytics-proof window opens.
- A creator can submit the analytics proof early, before day 7 — not forced to wait exactly until then.
- A creator can replace/resubmit their analytics proof link if they submitted the wrong one.

**Visibility & stats**

- Can see *why* a clip was rejected — the Admin/Mod's reason text is shown, not just a rejected status.
- Cannot see the campaign's payout formula (Base Rate/Divisor) — only their own resulting earnings per clip.
- Cannot see the campaign's Total Budget or how much remains.
- Can see the campaign's View Minimum and other rules up front (not just discovered via warnings).

**Money**

- Sees a clip's status change to "paid" in-app, not only via Discord.
- Sees a running earnings total **per campaign only** — no aggregated lifetime total across all their campaigns.

**Limits & enforcement**

- Hitting the 100/day submission limit shows a clear "come back tomorrow"-style message, not a bare rejection.
- A creator can be temporarily suspended from submitting (e.g. while under fraud review) without being fully banned.

## Clip data layer — ScrapeCreators

Views, likes, captions, and thumbnails are pulled automatically via the [ScrapeCreators API](https://scrapecreators.com/), covering TikTok, Instagram, and YouTube.

- **No creator OAuth required.** ScrapeCreators reads public data from a pasted link/handle — creators keep the existing "paste a link" flow, they never connect or authorize their social account.
- Scope of use: **views, likes, and post metadata only.** It does not replace the audience-quality verification step (see next section).
- It is a third-party scraping service, not an official platform API — no ToS-backed data guarantee from TikTok/Meta/Google. Worth monitoring for reliability as usage scales.
- "Refresh views now" (manual trigger) and a scheduled background refresh (e.g. Vercel Cron) both call ScrapeCreators to update view/like counts on existing clips.
- **Instagram photo/carousel posts have no view data at all.** Instagram's public data only exposes a
  view/play count for video content (Reels); a multi-photo carousel post genuinely carries no such
  field, confirmed by ScrapeCreators' own `is_video: false`. This is a hard platform limitation, not a
  bug — see "Manual view entry" below for how those clips still earn.

### Manual view entry (Instagram photo/carousel posts only)

For a clip ScrapeCreators has confirmed is an Instagram photo/carousel (`is_video: false`), a Mod/
Admin/Owner may manually type in a view count — read off the creator's own private analytics screen in
their proof video — instead of relying on the (nonexistent) automatic number. Rules:

- **Never for a real video.** A clip where ScrapeCreators returns `is_video: true` always uses the
  automatic number; manual entry is refused server-side regardless of what the UI shows. An unrefreshed
  clip (`is_video` still unknown) is refused too — confirmation must come from an actual successful fetch.
- **Feeds the payout formula exactly like an auto-fetched count would** — same CPM formula, same budget
  cap, same view-minimum gate. The manual number always wins over the (0) automatic one when present; a
  later "Refresh views now" never overwrites or clears it.
- **Reviewer-only.** The creator's own submission flow is unchanged — they still submit the same
  Analytics proof (video link or screenshot) as for any other clip; entering the view count is not
  something they do. The same "a Mod can't override another reviewer's entry, but Admin/Owner can" rule
  used for Qualifying Audience % applies here too.
- A blank submission clears the override and reverts to the automatic (0) number.

## Tier 1 audience verification

TikTok does not expose per-video audience-demographic data to anyone but the account owner, so this step is manual and human-reviewed — the following proof is **required** for every clip before it can earn anything:

1. **Analytics proof, 7 days later** — filed 7 days after the clip was posted, in one of two forms depending on the clip's current view count:
   - **Video link (always available):** an unlisted YouTube or Drive video link of their TikTok analytics. Recording must start from the home screen of the creator's phone or computer, show 2–3 seconds of the post itself playing, then navigate into that post's analytics and show all analytics data before ending.
   - **Screenshot upload (only while the clip has fewer than 10,000 views):** a real image file (PNG, JPEG or WebP, up to 4 MB) of the full audience analytics, stored privately in Vercel Blob.

   **The 10,000-view rule.** A clip with **fewer than 10,000** views may use either option. A clip with **10,000 or more** views may use the video link only — screenshot uploads are refused. The check uses the clip's stored view count at the moment of upload (exactly 10,000 is *not* eligible).

   **Not retroactive.** A screenshot validly accepted while the clip was under 10,000 views **stays valid** if the clip's views later pass 10,000: it still counts as proof, the reviewer can still enter a Qualifying Audience %, and the clip can still be approved and paid. The threshold only governs what a creator may submit going forward. Once over 10,000 views, a creator can no longer upload a new or replacement screenshot — replacing the proof then requires a video link. The views-at-submission and time are recorded on the clip as evidence.

   A clip holds one proof at a time: submitting a video link removes a previous screenshot, and uploading a screenshot replaces a previous link. Reviewers see a submitted screenshot **inline** in the review queue (with a click-through to full size), not just a link. Screenshots are private: only the clip's own creator and the Mod/Admin/Owner of that campaign can view them.

An Admin or Mod reads the proof and manually enters the **Qualifying Audience %** on the clip — this is never self-reported by the creator directly into a number field. Until the proof is attached and a % is entered, the clip shows a blocking warning and earns $0, even if it has cleared the view minimum.

If a creator never submits the 7-day analytics proof, there's no automatic rejection or expiry — the clip just stays blocked, and the assigned reviewer gets an in-app notification reminding them to chase it up.

## Payout formula

Each campaign sets its own three parameters; the formula shape is fixed platform-wide.

The Owner can edit a campaign's Base Rate, Divisor, and Max Pay Per Post at any time; changes apply only to clips reviewed/paid going forward and are not applied retroactively to already-earned amounts.

```
CPM      = min(Qualifying Audience % ÷ Divisor, 1) × Base Rate
Earnings = CPM × (Views ÷ 1000)
Payout   = min(Earnings, Max Pay Per Post)
```

**Base Rate is a ceiling on CPM, not just a multiplier.** The Divisor is the qualifying threshold: below
it, CPM scales proportionally as usual. At or above it, CPM stays flat at Base Rate — a clip can't earn
a higher CPM by clearing the threshold with room to spare. (78% qualifying with a 50 Divisor is *not*
worth $1.56 CPM at a $1.00 Base Rate; it's worth $1.00, same as exactly 50% or a full 100%.)

| Parameter | Set by | Default |
| --- | --- | --- |
| Base Rate | Campaign | e.g. $1.00 |
| Divisor | Campaign | 50 |
| Max Pay Per Post | Campaign | e.g. $500 (varies per campaign — not global) |
| Qualifying Audience % | Admin/Mod, per clip | — (manually entered from proof) |
| View Minimum | Campaign | e.g. 1,000 views |
| Total Budget | Campaign | e.g. $10,000 — approvals/payouts stop once spent |
| Mod Mark-Paid Threshold | Campaign (Owner/Admin) | e.g. $50 — Mods can mark clips paid up to this amount; above it, only Admin/Owner can |

**Worked example** (Divisor 50, Base Rate $1.00): a clip with 25% qualifying audience → CPM = (25÷50)×$1.00 = $0.50. At 4,000,000 views → Earnings = $0.50 × 4,000 = $2,000 → capped at the campaign's Max Pay Per Post (e.g. $500), so the clip pays out $500, not $2,000.

Nothing is owed until a clip is: (1) approved, (2) past the campaign's view minimum, and (3) has the analytics proof attached and a Qualifying Audience % entered.

Once a campaign's Total Budget is fully spent, no further clips are approved or paid out on it — the Owner/Admin sees remaining budget and can raise the cap or close the campaign.

## Fraud prevention & rate limits

- **Duplicate/stolen-link detection** — flag a submitted URL that has already been submitted by another creator, or that shows signs of not belonging to the submitting creator.
- **Multi-round review** — Admins/Mods can approve or reject a clip more than once over its lifetime (not a one-shot decision), each rejection carrying a required reason — used in particular when bot-like behavior is suspected (e.g. sudden unnatural view/like spikes).
- **Submission rate limit:** 100 clip submissions per creator per day by default — configurable per campaign by the Owner.

*At launch, bot-behavior detection is fully manual* — no automated flagging. Admins/Mods judge suspicious view/like patterns themselves when deciding whether to reject with a reason. Automated detection (ratio checks, velocity thresholds) is a future enhancement, not required for v1.

## Notifications

New capability (the original Monetize build had none). **In-app only** — no email, no Discord bot.

**Delivery:** a bell icon with a dropdown list, notifications persist until the user dismisses them (standard SaaS pattern) — not a disappearing toast.

**Events that trigger a notification** (kept to the essentials): clip approved, clip rejected (with reason), payout marked paid, and a reviewer reminder when a clip's 7-day analytics proof is still missing.

## Payouts

The app calculates what's owed but **never moves money**. Actual payment happens manually on Discord, outside the platform. In-app, an Admin/Mod/Owner marks a clip **"Mark paid"** once payment has actually been sent, which moves it out of "Still Owed." No payment processor, no tax handling, and no FTC paid-partnership tagging enforcement are in scope.

## Tech stack & architecture

- **Framework/hosting:** Next.js on Vercel, source on GitHub (kept from the current build).
- **Scale target:** thousands of creator/reviewer accounts spread across many independent campaigns — implies the data model must be tenant-scoped from the start (every core table keyed by campaign\_id), not retrofitted later.
- **External dependency:** ScrapeCreators API for view/like/metadata refresh — needs a background job (Vercel Cron or similar) for scheduled refresh plus the existing manual "Refresh views now" trigger, with sensible rate/credit-usage handling given ScrapeCreators is metered per request.
- **File storage:** Vercel Blob (private store, `BLOB_READ_WRITE_TOKEN`) holds only analytics-proof screenshots, and only for clips under 10,000 views; images are served through an access-checked route (`/api/proof/[campaignId]/[clipId]`), never a public URL. The video-link option stays external (YouTube unlisted / Drive).
- **Database:** Postgres, provisioned directly through Vercel's Storage/Marketplace tab (Neon-backed) — no separate Neon or Supabase account.
- **Auth:** turnkey provider (e.g. Clerk), chosen and fully implemented end-to-end — handles multi-role (Owner/Admin/Mod/Creator), platform-wide and per-campaign scoping. **Login is username + password** (no email required, matching the current Liftly UI), with a forgot-password/reset flow.
- **Creator onboarding:** an Owner or Mod generates a reusable invite link per campaign — the same link can onboard many creators and stays active until the Owner/Mod revokes it. No public self-signup.

## Technical operations

The sections below fill gaps between the business spec and an actually-buildable system — defaults chosen where no explicit decision was made; flag if any should change.

### API / route design

No public REST API is needed — this isn't consumed by external clients. Use **Next.js Server Actions**, colocated by domain, validated with `zod` schemas on every input:

- **Campaigns:** `createCampaign`, `updateCampaignSettings`, `pauseCampaign`, `closeCampaign`, `reopenCampaign`, `transferCampaignOwnership`
- **People:** `generateInviteLink`, `revokeInviteLink`, `addAdmin`, `addMod`, `removeMod`, `removeCreator`, `changeRole`
- **Clips:** `submitClip`, `deleteClip` (delete-and-resubmit pattern), `refreshViews` (manual + a scheduled version for Vercel Cron)
- **Review:** `reviewClip` (approve/reject with reason), `setQualifyingAudiencePct`, `attachVideoProof`, `markPaid`
- **Notifications:** `listNotifications`, `markNotificationRead`

### Security

- **Password hashing & sessions:** handled natively by Clerk — no custom crypto code needed.
- **API-level rate limiting** (distinct from the business-level 100/day submission cap): throttle login attempts and invite-link redemption attempts, e.g. via Upstash Redis or Vercel Edge Middleware.
- **Input validation:** `zod` on every Server Action; submitted clip URLs are validated against expected TikTok/Instagram/YouTube URL patterns before a ScrapeCreators call is made, rejecting anything malformed up front.

### Bootstrap process

There's no self-signup path for the platform Owner (by design — exactly one exists). The first Owner row is created by a one-time seed script run during initial deployment, setting `is_platform_owner = true` — never exposed through any UI route.

### ScrapeCreators failure handling

Wrap every call in try/catch with retry-with-backoff (e.g. 3 attempts). On failure, keep showing the last-known-good `views`/`likes` values rather than zeroing them out, and surface a small "stats may be outdated" indicator using `last_refreshed_at` rather than blocking the page.

### Error monitoring & logging

Sentry (or Vercel's built-in observability) for exception tracking. `clip_review_events` already doubles as a structured audit log for review actions; no separate logging system is required for that specific need.

### Environments & secrets

`DATABASE_URL`, Clerk keys, and `SCRAPECREATORS_API_KEY` live in Vercel's environment variables (scoped to Production/Preview/Development), never committed to the repo. Vercel's preview deployments (one per PR) serve as staging before promoting to production.

### Indexes

Beyond the uniqueness constraints already in the schema: `clips(campaign_id, status)` for the review queue, `clips(campaign_id, creator_user_id, submitted_at)` for the daily-limit check and a creator's own clip list, and `notifications(user_id, read)` for the bell dropdown. Full detail lives in the Database Schema tab.

### Timezone handling

All timestamps stored in UTC. The 7-day analytics-proof window and the daily submission-limit reset are both computed in UTC uniformly, not per-campaign local time — flag if a campaign needs its own timezone instead.

### Legal basics

A lightweight privacy policy should exist at launch, covering stored usernames/passwords (via Clerk), stored analytics-proof links, and campaign/creator data — standard financial-services compliance doesn't apply since payouts happen outside the app on Discord. This still needs a human (ideally legal) review, not something Claude Code should draft as binding legal text.


## Design system

Brand reference: [usemonetize.co](https://usemonetize.co/) — the real Monetize marketing site. Dark theme, gold accent, matching that brand rather than the old Liftly visual style.

### Colors (visual estimate from a screenshot — spot-check against the live site's dev tools if pixel-perfect matching matters)

```css
--bg-primary: #0A0A0A;      /* near-black page background */
--bg-secondary: #000000;    /* pure black panels/cards */
--text-primary: #FFFFFF;
--text-secondary: #A3A3A3;  /* muted/secondary text */
--accent-gold-light: #F0C572;
--accent-gold-dark: #9C7A2E;
--accent-gradient: linear-gradient(135deg, #F0C572, #9C7A2E);
--border-gold: #C9A227;      /* metallic gold card/button borders */
--border-subtle: #2A2A2A;    /* low-contrast dividers */
```

### Shape & component language

- Fully rounded pill-shaped buttons and badges, filled with the gold gradient on primary actions.
- Cards on a black fill with a thin gold-gradient border (visible on the hero's stacked mockup cards).
- Toggle switches: dark track, white knob.

### Typography

Bold sans-serif for most UI text; an italic serif face used selectively for emphasized words in headlines (a stylistic accent, not the body font) — keep this contrast for marketing-adjacent pages (landing/auth) but a plain bold sans is fine for dense data screens (the review queue, clip feed) where legibility matters more than flourish.

### Implementation

Tailwind CSS + shadcn/ui, with the tokens above wired into Tailwind's theme config (`tailwind.config.ts`) rather than hardcoded per component, so the palette stays a single source of truth. shadcn components get restyled to the gold/black palette and pill shape rather than left at their default look.

## Testing strategy

Full coverage: unit + integration + e2e.

- **Unit:** Vitest, covering business logic in isolation — the payout formula (CPM/Earnings/Payout math, including the Max Pay Per Post cap and Mod Mark-Paid Threshold), role/permission resolution, and the daily submission-limit calculation.
- **Integration:** Server Actions tested end-to-end against a real test database (a disposable Postgres schema or a tool like Testcontainers) — this is where the cross-tenant isolation tests from Task 1 belong, plus things like "a Mod above the pay threshold gets rejected."
- **E2E:** Playwright, simulating real flows in a browser — at minimum: a creator signs up via invite link and submits a clip; an Admin/Mod reviews, sets Qualifying Audience %, and approves it; a payout appears and gets marked paid.
- **CI:** tests run automatically on every pull request via GitHub Actions before merge — flag if a different CI setup is preferred.


## Open questions & next steps

**All open questions are now resolved.** This spec is ready to hand to Claude Code for implementation — starting with the database schema (tables, relationships, tenant-scoping), then auth (Clerk) and campaign CRUD.
