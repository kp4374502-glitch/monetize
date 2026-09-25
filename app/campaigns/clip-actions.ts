"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUserId } from "@/lib/auth/ensure-user";
import * as svc from "@/lib/clips/service";
import type { ActionState } from "@/components/action-form";

/**
 * Turns thrown business-rule errors into a message the form can show. If `fn` resolves with a
 * string, it's shown as a success message (e.g. "Refreshed 12 of 14 clips.").
 */
async function run(campaignId: string, fn: (userId: string) => Promise<unknown>): Promise<ActionState> {
  let result: unknown;
  try {
    result = await fn(await requireUserId());
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Invalid input." };
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/history`); // deleteClipAction can run from either page
  return typeof result === "string" ? { ok: true, message: result } : { ok: true };
}

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export const submitClipAction = async (campaignId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, async (u) => {
    await svc.submitClip(u, campaignId, text(fd, "url"));
  });

export const attachProofAction = async (campaignId: string, clipId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) => svc.attachVideoProof(u, campaignId, clipId, text(fd, "proofUrl")));

// Task 5 Part 2: attachScreenshotAction (new screenshot upload) has been removed — a video link
// (attachProofAction, above) is now the only proof method going forward. An already-accepted
// screenshot on an existing clip still displays and counts as valid; see hasAnalyticsProof.

export const refreshViewsAction = async (campaignId: string, clipId: string, _p: ActionState, _fd: FormData) =>
  run(campaignId, (u) => svc.refreshViews(u, campaignId, clipId));

/** Dashboard-wide "Refresh all views now" — Mod/Admin/Owner only, scoped to this one campaign. */
export const refreshCampaignViewsAction = async (campaignId: string, _p: ActionState, _fd: FormData) =>
  run(campaignId, async (u) => {
    const r = await svc.refreshCampaignClips(u, campaignId);
    if (r.attempted === 0) return "No pending or approved-unpaid clips to refresh.";
    const failedNote = r.failed ? ` ${r.failed} could not be refreshed right now — ScrapeCreators may be rate-limited or low on credits.` : "";
    return `Refreshed ${r.updated} of ${r.attempted} clip${r.attempted === 1 ? "" : "s"}.${failedNote}`;
  });

export const setPctAction = async (campaignId: string, clipId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) => svc.setQualifyingAudiencePct(u, campaignId, clipId, text(fd, "pct")));

/**
 * Mod/Admin/Owner only: manual view count for a clip ScrapeCreators confirms is an Instagram photo/
 * carousel (no automatic view data exists for that post type — see canSetManualViews). Blank clears
 * the override. Refused server-side for anything else, regardless of what the UI shows.
 */
export const setManualViewsAction = async (campaignId: string, clipId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) => svc.setManualViews(u, campaignId, clipId, text(fd, "manualViews")));

/** "Clip Approve" — content/eligibility only, independent of the 7-day gate. Admin/Owner only. */
export const clipApproveAction = async (campaignId: string, clipId: string, _p: ActionState, _fd: FormData) =>
  run(campaignId, (u) => svc.clipApprove(u, campaignId, clipId));

export const reviewAction = async (campaignId: string, clipId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) =>
    svc.reviewClip(
      u,
      campaignId,
      clipId,
      text(fd, "intent") === "reject" ? { action: "reject", reason: text(fd, "reason") } : { action: "approve" },
    ),
  );

export const markPaidAction = async (campaignId: string, clipId: string, _p: ActionState, _fd: FormData) =>
  run(campaignId, (u) => svc.markPaid(u, campaignId, clipId));

/** Owner/Admin only, any status — soft delete (see svc.deleteClip). The frontend confirms before submitting. */
export const deleteClipAction = async (campaignId: string, clipId: string, _p: ActionState, _fd: FormData) =>
  run(campaignId, (u) => svc.deleteClip(u, campaignId, clipId));

/**
 * Mod/Admin/Owner only, one-time: manually confirm a clip's post date when ScrapeCreators never
 * captured one — the only way out of an indefinitely-locked "awaiting_analytics" clip (see
 * analyticsGateState / svc.setPostedAt). Refused server-side if a date is already known.
 */
export const setPostedAtAction = async (campaignId: string, clipId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) => svc.setPostedAt(u, campaignId, clipId, text(fd, "postedAt")));
