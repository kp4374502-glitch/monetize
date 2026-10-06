/**
 * One-time change for the Hair u campaign: Base Rate goes from $1.00 to $0.50 for posts submitted
 * on/after 2026-09-24T00:00:00Z ("submitted" = clips.submitted_at, i.e. when it was submitted to
 * the app, not when it was posted on the platform), and every older post is pinned at its current
 * $1.00 via clips.base_rate_override so nothing already earned moves.
 *
 *   1. older posts (submitted before the cutoff, live or deleted): base_rate_override = 1.00
 *   2. campaign base_rate = 0.50 (so new posts, and the newer ones, follow it from here on)
 *   3. cpm / earnings / payout recomputed for the newer, live, UNPAID posts (paid posts are frozen)
 * All in one transaction. Uses the real computeEconomics, so it matches the app exactly.
 *
 * Run --dry-run first (read-only). Real run needs SNAPSHOT_PATH: the pre-change values of every
 * post in the campaign are saved there first, for rollback.
 * Must run AFTER the code that honors base_rate_override is deployed.
 */
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import { computeEconomics, effectiveViews } from "../lib/clips/rules";

const CUTOFF = "2026-09-24T00:00:00Z";
const OLD_RATE = 1;
const NEW_RATE = 0.5;
const dryRun = process.argv.includes("--dry-run");
const sql = postgres(process.env.DATABASE_URL!);

const camps = await sql`select * from campaigns where name = 'Hair u'`;
if (camps.length !== 1) throw new Error(`Expected exactly one "Hair u" campaign, found ${camps.length}.`);
const camp = camps[0];
if (Number(camp.base_rate) !== OLD_RATE) {
  console.log(`Campaign base_rate is ${camp.base_rate}, not ${OLD_RATE}. Already changed? Nothing to do.`);
  await sql.end();
  process.exit(0);
}

const posts = await sql`select * from clips where campaign_id = ${camp.id}`;
const cutoff = new Date(CUTOFF).getTime();
const older = posts.filter((p) => new Date(p.submitted_at).getTime() < cutoff);
const newer = posts.filter((p) => new Date(p.submitted_at).getTime() >= cutoff);

const econ = (p: (typeof posts)[number], rate: number) => {
  const e = computeEconomics({
    views: effectiveViews({ views: p.views, manualViews: p.manual_views }),
    qualifyingAudiencePct: p.qualifying_audience_pct === null ? null : Number(p.qualifying_audience_pct),
    videoProofUrl: p.video_proof_url,
    analyticsScreenshotPathname: p.analytics_screenshot_pathname,
    campaign: { baseRate: rate, divisor: Number(camp.divisor), maxPayPerPost: Number(camp.max_pay_per_post), viewMinimum: camp.view_minimum },
  });
  return e.eligible ? { cpm: e.cpm, earnings: e.earnings, payout: e.payout } : { cpm: null, earnings: null, payout: null };
};
const same = (p: (typeof posts)[number], e: ReturnType<typeof econ>) =>
  (p.cpm === null ? null : Number(p.cpm)) === (e.cpm === null ? null : Number(e.cpm)) &&
  (p.payout === null ? null : Number(p.payout)) === (e.payout === null ? null : Number(e.payout));
const live = (p: (typeof posts)[number]) => p.deleted_at === null;
const sum = (xs: (string | null)[]) => xs.reduce((n, v) => n + (v === null ? 0 : Number(v)), 0).toFixed(2);

const newerLiveUnpaid = newer.filter((p) => live(p) && p.paid_status === "unpaid");
const newerPaid = newer.filter((p) => p.paid_status === "paid");
const olderLive = older.filter(live);

console.log("== BEFORE ==");
console.log(`campaign base_rate: ${camp.base_rate}   status: ${camp.status}   budget_spent: ${camp.budget_spent}`);
console.log(`posts in campaign (incl. deleted): ${posts.length}`);
console.log(`  older (submitted before ${CUTOFF}): ${older.length} (live ${olderLive.length}, deleted ${older.length - olderLive.length})`);
console.log(`  newer (on/after):                  ${newer.length} (live ${newer.filter(live).length}, deleted ${newer.length - newer.filter(live).length})`);
console.log(`  paid posts in newer set (frozen, untouched): ${newerPaid.length}`);

console.log("\n== SANITY: stored values vs the formula at $1.00 ==");
console.log(`older live posts whose stored cpm/payout differ from the formula at $1.00: ${olderLive.filter((p) => !same(p, econ(p, OLD_RATE))).length} of ${olderLive.length}`);
console.log(`newer live unpaid posts whose stored values differ from the formula at $1.00: ${newerLiveUnpaid.filter((p) => !same(p, econ(p, OLD_RATE))).length} of ${newerLiveUnpaid.length}`);

console.log(`\n== AFTER (formula at $${NEW_RATE.toFixed(2)}) for the ${newerLiveUnpaid.length} newer live unpaid posts ==`);
for (const status of ["approved", "pending", "awaiting_analytics", "rejected"]) {
  const g = newerLiveUnpaid.filter((p) => p.status === status);
  if (!g.length) continue;
  const after = g.map((p) => econ(p, NEW_RATE));
  console.log(
    `  ${status.padEnd(19)} ${String(g.length).padStart(3)} posts | payout now $${sum(g.map((p) => p.payout)).padStart(8)} -> $${sum(after.map((a) => a.payout)).padStart(8)} | changed: ${g.filter((p, i) => !same(p, after[i])).length}`,
  );
}
const owedNow = sum(posts.filter((p) => live(p) && p.status === "approved" && p.paid_status === "unpaid").map((p) => p.payout));
const owedAfter = sum(
  posts.filter((p) => live(p) && p.status === "approved" && p.paid_status === "unpaid").map((p) => (newer.includes(p) ? econ(p, NEW_RATE).payout : p.payout)),
);
console.log(`\nCampaign "Owed" (approved, unpaid): $${owedNow} -> $${owedAfter}`);
console.log(`Will set base_rate_override = 1.00 on ${older.length} older posts, campaign base_rate -> ${NEW_RATE.toFixed(2)}.`);

if (dryRun) {
  console.log("\n--dry-run: no changes made.");
  await sql.end();
  process.exit(0);
}

const snapshotPath = process.env.SNAPSHOT_PATH;
if (!snapshotPath) throw new Error("SNAPSHOT_PATH is required for a real run.");
writeFileSync(
  snapshotPath,
  JSON.stringify({
    campaign: { id: camp.id, base_rate: camp.base_rate },
    posts: posts.map((p) => ({ id: p.id, base_rate_override: p.base_rate_override, cpm: p.cpm, earnings: p.earnings, payout: p.payout })),
  }),
);
console.log(`\nsnapshot written: ${posts.length} posts -> ${snapshotPath}`);

const res = await sql.begin(async (tx) => {
  const pinned = await tx`
    update clips set base_rate_override = ${OLD_RATE.toFixed(4)}
    where campaign_id = ${camp.id} and submitted_at < ${CUTOFF} returning id`;
  const rate = await tx`update campaigns set base_rate = ${NEW_RATE.toFixed(4)} where id = ${camp.id} and base_rate = ${OLD_RATE.toFixed(4)} returning id`;
  if (rate.length !== 1) throw new Error("Campaign rate changed underneath us; rolling back.");
  let recomputed = 0;
  for (const p of newerLiveUnpaid) {
    const e = econ(p, NEW_RATE);
    const r = await tx`
      update clips set cpm = ${e.cpm}, earnings = ${e.earnings}, payout = ${e.payout}
      where id = ${p.id} and campaign_id = ${camp.id} and paid_status = 'unpaid' returning id`;
    recomputed += r.length;
  }
  return { pinnedOlder: pinned.length, campaignRateUpdated: rate.length, recomputedNewer: recomputed };
});
console.log("done:", res);
await sql.end();
process.exit(0);
