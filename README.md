# Monetize — Task 1 scaffold

This is the output of `TASK_01_FOUNDATION.md`, built as far as a sandboxed environment with **no
network access and no access to your Vercel/Clerk/GitHub accounts** can take it. Everything here
is real, hand-written code — nothing was faked — but it has **not been run as a live application**,
because that requires `npm install` (blocked — this sandbox got a 403 from the npm registry) and
real cloud accounts this environment can't reach.

## What's actually verified right now

**Logic, executed and passing:** the payout formula (`lib/payout.ts`) was extracted, inlined, and
run with Node's built-in `assert` module — no dependencies required — and all 4 checks genuinely
passed: the spec's worked example (25% audience, 4M views → capped at $500), an uncapped payout,
the full CPM-scaling table, and the zero-divisor guard.

**Syntax, checked for real:** every plain `.ts` file (`lib/payout.ts`, `lib/auth/roles.ts`,
`drizzle/schema.ts`, `scripts/seed-owner.ts`, `drizzle/migrate.ts`, `middleware.ts`,
`lib/utils.ts`, `lib/db/client.ts`) was run through `node --experimental-strip-types --check` and
parses without error. The two `.tsx` files (`app/page.tsx`, `app/layout.tsx`) **could not** be
checked this way — Node's type-stripping doesn't handle JSX — so their syntax is unverified until
a real TypeScript/Next.js toolchain (via `npm install`) compiles them.

## What's written but NOT yet run

| File | What it is | Why it's unverified here |
|---|---|---|
| `app/layout.tsx`, `app/page.tsx` | Next.js app shell: root layout with ClerkProvider + dark theme, a placeholder home page that calls the role layer | Needs `npm install` + a real Next.js dev server; JSX syntax unverified (see above) |
| `middleware.ts` | Clerk middleware protecting all routes except sign-in/up and invite links | Needs Clerk keys + a running app to actually enforce anything |
| `drizzle/schema.ts` | Full schema matching `docs/DATABASE_SCHEMA.md`, every constraint and index included | Needs a real Postgres connection (`DATABASE_URL`) to migrate against |
| `drizzle/migrate.ts` | Migration runner (`npm run db:migrate`) | Same — needs `DATABASE_URL` and generated migration files (`npm run db:generate` first) |
| `lib/auth/roles.ts` | Tenant-scoped role resolution (`getRoleForCampaign`, `requireRole`, `getCampaignForUser`) | Needs the DB above, plus Clerk wired up, to actually query against |
| `scripts/seed-owner.ts` | Bootstrap script for the one platform Owner | Needs the DB, and a real Clerk-managed password hash (currently a placeholder) |
| `tailwind.config.ts` + `app/globals.css` | Brand tokens from usemonetize.co wired into Tailwind | Needs `npm install` + the dev server to actually render anything |
| `components.json`, `lib/utils.ts` | shadcn/ui config and the `cn()` helper its components expect | Needs `npx shadcn init`/`add` to actually pull components in |
| `tests/unit/payout.test.ts` | The Vitest version of the manually-verified check above | Needs `vitest` installed to run — logic already proven manually |
| `tests/integration/tenant-isolation.test.ts` | Stub (`it.todo`) for cross-tenant isolation | Needs a real test DB — can't be written for real until the DB exists |
| `tests/e2e/core-flow.spec.ts` | Stub (`test.skip`) for the full creator→payout flow | Needs a running app with actual UI, which doesn't exist yet |
| `.github/workflows/ci.yml` | CI pipeline that runs all of the above on every PR | Needs to actually live in a GitHub repo to run |

## What you (or a real Claude Code session) need to do to finish Task 1

1. `git init`, commit this scaffold, push to your GitHub repo.
2. In Vercel: link the repo, provision Postgres via the Storage/Marketplace tab, run
   `vercel env pull .env.local` to get `DATABASE_URL`.
3. `npm install`, then `npm run db:generate && npm run db:migrate` to create the actual tables.
4. Sign up for Clerk, add your keys to `.env.local` — the ClerkProvider, middleware, and route
   protection are already wired in `app/layout.tsx` and `middleware.ts`, so this step should
   mostly just be "add the keys and confirm sign-in/sign-up work."
5. `npx shadcn init` (config already present in `components.json`) then add components as needed.
6. Replace the placeholder password hash in `scripts/seed-owner.ts` with Clerk's actual
   user-creation flow, then run `npm run db:seed-owner -- --username=... --password=...` once.
7. `npm run dev` and confirm the placeholder home page loads and shows your Clerk sign-in state.
8. `npm test` (Vitest) and `npm run test:e2e` (Playwright) to confirm everything actually passes
   in a real environment.
9. Push to GitHub — the CI workflow will pick up from there automatically.

This scaffold gets you to the point where step 1 is "run `npm install`," not "write the app from
scratch."

