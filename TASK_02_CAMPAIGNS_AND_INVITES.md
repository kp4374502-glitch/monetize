# Task 2 — Campaign creation & invite-link onboarding

Read `CLAUDE.md`, `docs/PRODUCT_SPEC.md`, and `docs/DATABASE_SCHEMA.md` before starting if this is
a new session. This task builds directly on Task 1's foundation — the schema, `lib/auth/roles.ts`,
Clerk auth, and the app shell should already exist and be working (confirmed by the placeholder
page showing a real signed-in user and real role values).

## Goal

By the end of this task: the platform Owner can create a campaign with its full payout
configuration, generate a reusable invite link for it, and a creator can follow that link, sign
up, and land inside the campaign. A basic campaign switcher lets anyone with access to more than
one campaign move between them. Still **no clip submission, no ScrapeCreators, no review queue** —
this task is entirely about campaigns existing and people getting into them.

## Steps

1. **`createCampaign` Server Action (Owner-only).** Validate input with `zod`: `brandName`, `name`,
   `baseRate`, `divisor` (default 50), `maxPayPerPost`, `viewMinimum` (default 1000),
   `totalBudget`, `modMarkPaidThreshold`, `dailySubmissionLimit` (default 100),
   `eligiblePlatforms` (array of `tiktok`/`instagram`/`youtube`). Reject the call outright if the
   caller isn't `is_platform_owner` — per the spec, campaign creation is strictly Owner-only, not
   even Admin can do this. Insert the row with `ownerUserId` set to the caller.

2. **Campaign creation UI.** A simple form (shadcn `Input`, `Select`, `Button` components) at e.g.
   `/campaigns/new`, visible only to the platform Owner. On submit, redirect to the new campaign's
   dashboard page (a placeholder is fine — Task 3 builds the real dashboard).

3. **`updateCampaignSettings` Server Action.** Owner or Admin only (`requireRole(..., "admin")`
   covers both per the rank table in `roles.ts`). Same fields as creation, all editable. Per the
   spec: changes apply only going forward, never retroactively recalculating already-approved
   clips (there's nothing to recalculate yet in this task, but don't write logic that assumes
   otherwise later).

4. **Campaign lifecycle actions.** `pauseCampaign` and `closeCampaign` (Owner or Admin, sets
   `status`), `reopenCampaign` (Owner or Admin), and a separate `deleteCampaign` that is
   **Owner-only** — Admin can pause/close/archive but the spec does not give Admin delete rights.
   Enforce that distinction explicitly rather than reusing the same role check for all four.

5. **`generateInviteLink` and `revokeInviteLink` Server Actions.** Owner, Admin, or Mod can call
   these (per the detailed Mod/Admin permission sections — invite links are the one people-facing
   action Mods get). Generate a random unique `code`, store it against the campaign. Revoking sets
   `revoked = true` rather than deleting the row (keep the audit trail).

6. **Invite link redemption page**, at `/invite/[code]` (already public in `middleware.ts` —
   confirm that route matcher still applies). Look up the code; if missing or revoked, show a
   clear error rather than a generic 404. If valid, prompt sign-up/sign-in via Clerk, then create
   the `campaign_creators` row linking that user to that campaign with `invite_link_id` set. This
   is a **reusable** link — don't invalidate it after one use.

7. **Campaign switcher.** A small dropdown/menu (works for creators, mods, admins, and owners
   alike) listing every campaign the signed-in user has a role on — query via the same functions
   `lib/auth/roles.ts` already exposes, don't write a second parallel lookup. Selecting one
   navigates to that campaign's (still-placeholder) dashboard route.

8. **Tests.**
   - **Unit:** `zod` schema validation for campaign creation/update inputs (reject a negative
     `baseRate`, reject an empty `eligiblePlatforms` array, etc.).
   - **Integration:** replace the relevant `it.todo`s in `tests/integration/tenant-isolation.test.ts`
     now that campaigns actually exist to test against; add a new integration test file for invite
     links — a revoked link cannot be redeemed, a valid link creates exactly one
     `campaign_creators` row even if redeemed by two different browser sessions concurrently (or
     note this as a known race condition to fix if it's out of reach for this task).
   - **E2E:** replace the `test.skip` in `tests/e2e/core-flow.spec.ts`'s first half — an Owner
     creates a campaign, generates an invite link, and a new browser context follows that link,
     signs up, and lands inside the campaign. Leave the review/payout half of that test skipped
     until Task 3.

## Explicitly out of scope for this task

Clip submission, ScrapeCreators integration, the review queue, Qualifying Audience %, video
proof, payouts, notifications, adding/removing Mods or Admins (only invite-link-based creator
onboarding is in scope — people-management beyond that is a later task), campaign budget
enforcement logic (the field exists and is stored, but nothing consumes it yet since there are no
clips to spend it on).

## When done

Summarize: confirm `createCampaign` actually rejects a non-Owner caller, confirm a revoked invite
link is rejected at `/invite/[code]`, confirm the e2e test (Owner creates campaign → invite link →
new user joins) passes, and confirm the campaign switcher shows the right campaigns for a
multi-campaign user.
