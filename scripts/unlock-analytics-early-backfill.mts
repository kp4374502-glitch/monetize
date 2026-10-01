/**
 * One-time action: unlock Analytics-proof submission immediately for every clip currently stuck
 * behind the 7-day gate, across every campaign regardless of its status (paused campaigns don't
 * block proof submission -- only new clip submissions). Uses the real unlockAnalyticsEarly()
 * service function per clip, so each one gets its own audit event + "analytics_unlocked"
 * notification, exactly like a natural cron unlock. Does NOT touch posted_at.
 *
 * Run with --dry-run first to see the exact target list with no writes.
 */
import postgres from "postgres";
import { analyticsGateState } from "../lib/clips/rules";
import { unlockAnalyticsEarly } from "../lib/clips/service";

const OWNER_ID = "user_3JpgxHBmzrpBIIQRHdYl05k97gI"; // real platform Owner (kp4374502), current production Clerk ID -- attributed as the actor for this one-time ops action
const dryRun = process.argv.includes("--dry-run");

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  const rows = await sql`
    select cl.id, cl.campaign_id, cl.status, cl.posted_at, cl.analytics_unlocked_early_at, c.name as campaign_name
    from clips cl
    join campaigns c on c.id = cl.campaign_id
    where cl.status = 'awaiting_analytics'
      and cl.deleted_at is null
      and cl.video_proof_url is null
      and cl.analytics_screenshot_pathname is null
      and cl.analytics_unlocked_early_at is null
  `;

  const targets = rows.filter((r) =>
    analyticsGateState({ status: r.status, postedAt: r.posted_at, analyticsUnlockedEarlyAt: r.analytics_unlocked_early_at }).locked,
  );
  console.log(`Target set: ${targets.length} clip(s) across ${new Set(targets.map((t) => t.campaign_name)).size} campaign(s).`);
  const byCampaign = new Map<string, number>();
  for (const t of targets) byCampaign.set(t.campaign_name, (byCampaign.get(t.campaign_name) ?? 0) + 1);
  console.log("By campaign:", Object.fromEntries(byCampaign));

  if (dryRun) {
    console.log("\n--dry-run: no changes made.");
    await sql.end();
    return;
  }

  let unlocked = 0, failed = 0;
  for (const t of targets) {
    try {
      await unlockAnalyticsEarly(OWNER_ID, t.campaign_id, t.id);
      unlocked++;
    } catch (e) {
      failed++;
      console.error(`FAILED for clip ${t.id} (campaign ${t.campaign_name}):`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`\nDone. unlocked=${unlocked} failed=${failed}`);

  const [{ n: stillLocked }] = await sql`
    select count(*) as n from clips cl
    where cl.status = 'awaiting_analytics' and cl.deleted_at is null
      and cl.video_proof_url is null and cl.analytics_screenshot_pathname is null
      and cl.analytics_unlocked_early_at is null
      and cl.id = any(${targets.map((t) => t.id)})
  `;
  console.log(`Post-run check: ${stillLocked} of the ${targets.length} targets still show no override (should be 0).`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
