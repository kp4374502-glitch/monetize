# Monetize Clips — Product & Technical Spec

2026-09-18 · Compiled with @Someone

## Overview

Monetize Clips is a multi-tenant platform for running paid TikTok/Instagram/YouTube clipping campaigns: creators submit links to clips they've posted, a reviewer verifies view counts and audience quality, and the platform tracks what each creator has earned. The platform itself is free — no fee is taken from any campaign.

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

- Dashboard shows a visible countdown/reminder for when the 7-day video-proof window opens.
- A creator can submit the video proof early, before day 7 — not forced to wait exactly until then.
- A creator can replace/resubmit their video proof link if they submitted the wrong one.

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

## Tier 1 audience verification

TikTok does not expose per-video audience-demographic data to anyone but the account owner, so this step is manual and human-reviewed — the following proof is **required** for every clip before it can earn anything:

1. **Video proof, 7 days later** — creator submits an unlisted YouTube or Drive video link of their TikTok analytics, filed 7 days after the clip was posted. Recording must start from the home screen of the creator's phone or computer, show 2–3 seconds of the post itself playing, then navigate into that post's analytics and show all analytics data before ending.

An Admin or Mod reads the proof and manually enters the **Qualifying Audience %** on the clip — this is never self-reported by the creator directly into a number field. Until the proof is attached and a % is entered, the clip shows a blocking warning and earns $0, even if it has cleared the view minimum.

If a creator never submits the 7-day video proof, there's no automatic rejection or expiry — the clip just stays blocked, and the assigned reviewer gets an in-app notification reminding them to chase it up.

## Payout formula

Each campaign sets its own three parameters; the formula shape is fixed platform-wide.

The Owner can edit a campaign's Base Rate, Divisor, and Max Pay Per Post at any time; changes apply only to clips reviewed/paid going forward and are not applied retroactively to already-earned amounts.

```
CPM     = (Qualifying Audience % ÷ Divisor) × Base Rate
Earnings = CPM × (Views ÷ 1000)
Payout   = min(Earnings, Max Pay Per Post)
```

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

Nothing is owed until a clip is: (1) approved, (2) past the campaign's view minimum, and (3) has the video proof attached and a Qualifying Audience % entered.

Once a campaign's Total Budget is fully spent, no further clips are approved or paid out on it — the Owner/Admin sees remaining budget and can raise the cap or close the campaign.

## Fraud prevention & rate limits

- **Duplicate/stolen-link detection** — flag a submitted URL that has already been submitted by another creator, or that shows signs of not belonging to the submitting creator.
- **Multi-round review** — Admins/Mods can approve or reject a clip more than once over its lifetime (not a one-shot decision), each rejection carrying a required reason — used in particular when bot-like behavior is suspected (e.g. sudden unnatural view/like spikes).
- **Submission rate limit:** 100 clip submissions per creator per day by default — configurable per campaign by the Owner.

*At launch, bot-behavior detection is fully manual* — no automated flagging. Admins/Mods judge suspicious view/like patterns themselves when deciding whether to reject with a reason. Automated detection (ratio checks, velocity thresholds) is a future enhancement, not required for v1.

## Notifications

New capability (the original Monetize build had none). **In-app only** — no email, no Discord bot.

**Delivery:** a bell icon with a dropdown list, notifications persist until the user dismisses them (standard SaaS pattern) — not a disappearing toast.

**Events that trigger a notification** (kept to the essentials): clip approved, clip rejected (with reason), payout marked paid, and a reviewer reminder when a clip's 7-day video proof is still missing.

## Payouts

The app calculates what's owed but **never moves money**. Actual payment happens manually on Discord, outside the platform. In-app, an Admin/Mod/Owner marks a clip **"Mark paid"** once payment has actually been sent, which moves it out of "Still Owed." No payment processor, no tax handling, and no FTC paid-partnership tagging enforcement are in scope.

## Tech stack & architecture

- **Framework/hosting:** Next.js on Vercel, source on GitHub (kept from the current build).
- **Scale target:** thousands of creator/reviewer accounts spread across many independent campaigns — implies the data model must be tenant-scoped from the start (every core table keyed by campaign\_id), not retrofitted later.
- **External dependency:** ScrapeCreators API for view/like/metadata refresh — needs a background job (Vercel Cron or similar) for scheduled refresh plus the existing manual "Refresh views now" trigger, with sensible rate/credit-usage handling given ScrapeCreators is metered per request.
- **File storage:** none needed for proof — Tier 1 audience proof is an external video link (YouTube unlisted / Drive), not an uploaded file.
- **Database:** Postgres, provisioned directly through Vercel's Storage/Marketplace tab (Neon-backed) — no separate Neon or Supabase account.
- **Auth:** turnkey provider (e.g. Clerk), chosen and fully implemented end-to-end — handles multi-role (Owner/Admin/Mod/Creator), platform-wide and per-campaign scoping. **Login is username + password** (no email required, matching the current Liftly UI), with a forgot-password/reset flow.
- **Creator onboarding:** an Owner or Mod generates a reusable invite link per campaign — the same link can onboard many creators and stays active until the Owner/Mod revokes it. No public self-signup.

## Open questions & next steps

**All open questions are now resolved.** This spec is ready to hand to Claude Code for implementation — starting with the database schema (tables, relationships, tenant-scoping), then auth (Clerk) and campaign CRUD.
