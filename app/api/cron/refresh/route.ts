import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { refreshAllClips } from "@/lib/clips/service";
import { sendProofReminders } from "@/lib/notifications";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never run open if the secret isn't configured
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Daily: refresh view counts + proof reminders. */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refresh = await refreshAllClips();
  const remindersSent = await sendProofReminders();
  return NextResponse.json({ refresh, remindersSent });
}
