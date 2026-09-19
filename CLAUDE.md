# Monetize — Project Memory

This file is read automatically by Claude Code at the start of every session in this repo.
Full context lives in `/docs/PRODUCT_SPEC.md` and `/docs/DATABASE_SCHEMA.md` — read both before
touching any code that involves campaigns, roles, clips, or payouts.

## What this is
A multi-tenant SaaS platform for running paid TikTok/Instagram/YouTube clipping campaigns.
Brands each get a campaign with their own payout formula; creators submit clip links; Admins/Mods
review and verify; payouts are calculated in-app but paid out manually on Discord (this app never
moves money).

## Tech stack (fixed — do not substitute without asking)
- **Framework:** Next.js, deployed on Vercel
- **Database:** Postgres, provisioned through Vercel's Storage/Marketplace tab (Neon-backed) — do
  not set up a separate Neon or Supabase account
- **Auth:** Clerk — username + password login (no email required), with forgot-password/reset
- **External data:** ScrapeCreators API (https://scrapecreators.com/) for views/likes/post
  metadata on TikTok/Instagram/YouTube — public-data lookups only, no OAuth, no creator
  account-connect flow. See docs/PRODUCT_SPEC.md → "Clip data layer" for scope limits.
- **Source control:** GitHub, connected to the Vercel project

## Non-negotiable architectural rule
**Every campaign-scoped table carries `campaign_id`, and no query touching campaign data is ever
written without filtering by it.** This is a multi-tenant app serving many brands — a bug that
leaks one campaign's clips, creators, or financials into another campaign's view is the single
worst class of bug this app can ship. When in doubt, over-scope rather than under-scope.

## Roles (four: Owner, Admin, Mod, Creator)
Each role's exact permissions are fully enumerated in docs/PRODUCT_SPEC.md → "Roles & permissions"
(with dedicated "(detailed)" subsections per role). Don't infer permissions — look them up there.
Quick summary:
- **Owner** — exactly one platform-wide Owner; also one Owner per campaign (transferable). Top
  authority, no restrictions.
- **Admin** — platform-wide, automatically active on every campaign, strict superset of Mod.
- **Mod** — explicitly assigned per campaign, one campaign at a time, capped Mark-Paid authority
  (`campaigns.mod_mark_paid_threshold`).
- **Creator** — joins campaigns via reusable invite links, fully isolated from other creators'
  data.

## Payout formula (fixed shape, per-campaign parameters)
```
CPM      = (Qualifying Audience % ÷ Divisor) × Base Rate
Earnings = CPM × (Views ÷ 1000)
Payout   = min(Earnings, Max Pay Per Post)
```
`Base Rate`, `Divisor`, `Max Pay Per Post`, `View Minimum`, `Total Budget`, and
`Mod Mark-Paid Threshold` all live on the `campaigns` row — never hardcode them. Full detail and a
worked example are in docs/PRODUCT_SPEC.md → "Payout formula".

## Verification flow
A clip needs a 7-day-later video-proof link (YouTube unlisted / Drive) before an Admin/Mod can
enter a Qualifying Audience %. No file-upload/screenshot step exists in the current spec — see
docs/PRODUCT_SPEC.md → "Tier 1 audience verification" before changing this flow.

## Conventions
- Prefer server actions / route handlers that go through a single tenant-scoped data-access layer
  (see build step 4) rather than ad hoc Postgres queries scattered through components.
- Keep the ScrapeCreators integration isolated behind one module so its cost/rate-limit handling
  and caching live in one place.
- When a spec detail is ambiguous or missing, stop and ask rather than guessing — this project has
  a habit of encoding business rules as exact numbers (thresholds, limits, caps); silently
  approximating one is worse than asking.

## Design system (see docs/PRODUCT_SPEC.md → "Design system" for full detail)
Brand reference: usemonetize.co — dark theme, gold accent. Built with Tailwind CSS + shadcn/ui,
restyled to these tokens (wire into `tailwind.config.ts`, not hardcoded per component):
```css
--bg-primary: #0A0A0A;
--bg-secondary: #000000;
--text-primary: #FFFFFF;
--text-secondary: #A3A3A3;
--accent-gold-light: #F0C572;
--accent-gold-dark: #9C7A2E;
--accent-gradient: linear-gradient(135deg, #F0C572, #9C7A2E);
--border-gold: #C9A227;
--border-subtle: #2A2A2A;
```
Pill-shaped buttons/badges, gold-gradient card borders on black fill, bold sans-serif UI text with
an italic serif accent reserved for marketing/auth headlines (not dense data screens).

## Testing (see docs/PRODUCT_SPEC.md → "Testing strategy" for full detail)
Full coverage expected: **Vitest** for unit tests (payout formula, role/permission resolution,
daily-limit calculation), **integration tests** for Server Actions against a real test database
(this is where Task 1's cross-tenant isolation tests belong), and **Playwright** for e2e flows
(creator submits → reviewer approves → payout marked paid). Tests run in CI on every PR via GitHub
Actions before merge.

## Technical operations (defaults — see docs/PRODUCT_SPEC.md → "Technical operations" for detail)
- **No public REST API.** Use Next.js Server Actions, colocated by domain, validated with `zod` on
  every input.
- **Auth/security:** Clerk handles password hashing and sessions natively. Add separate API-level
  rate limiting (login attempts, invite-link redemption) distinct from the business-level 100/day
  submission cap. Validate clip URLs against TikTok/Instagram/YouTube patterns before any
  ScrapeCreators call.
- **Bootstrap:** the single platform Owner is created by a one-time seed script at initial
  deploy (`is_platform_owner = true`) — never via a UI route.
- **ScrapeCreators failures:** retry with backoff (3 attempts); on failure keep the last-known-good
  `views`/`likes` rather than zeroing them, and show a "stats may be outdated" indicator using
  `last_refreshed_at`.
- **Monitoring:** Sentry (or Vercel's built-in observability) for exceptions. `clip_review_events`
  already serves as the audit log for review actions.
- **Environments/secrets:** `DATABASE_URL`, Clerk keys, `SCRAPECREATORS_API_KEY` live in Vercel env
  vars (Production/Preview/Development), never committed. Vercel preview deployments serve as
  staging.
- **Timezones:** all timestamps in UTC; the 7-day proof window and the daily submission-limit
  reset are both computed in UTC.
- **Indexes:** `clips(campaign_id, status)`, `clips(campaign_id, creator_user_id, submitted_at)`,
  `campaign_mods(campaign_id)`, `campaign_creators(campaign_id)`, `notifications(user_id, read)`.
