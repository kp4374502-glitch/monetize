"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUserId } from "@/lib/auth/ensure-user";
import * as svc from "@/lib/clips/service";
import { MAX_SCREENSHOT_BYTES } from "@/lib/clips/image";
import type { ActionState } from "@/components/action-form";

/** Turns thrown business-rule errors into a message the form can show. */
async function run(campaignId: string, fn: (userId: string) => Promise<unknown>): Promise<ActionState> {
  try {
    await fn(await requireUserId());
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Invalid input." };
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export const submitClipAction = async (campaignId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, async (u) => {
    await svc.submitClip(u, campaignId, text(fd, "url"));
  });

export const attachProofAction = async (campaignId: string, clipId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) => svc.attachVideoProof(u, campaignId, clipId, text(fd, "proofUrl")));

/**
 * Upload an analytics screenshot (accepted only while the clip has fewer than 10,000 views — enforced in
 * the service, which re-checks everything; the size check here just fails fast before reading the file).
 */
export const attachScreenshotAction = async (campaignId: string, clipId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, async (u) => {
    const file = fd.get("screenshot");
    if (!(file instanceof File) || file.size === 0) throw new Error("Please choose a screenshot image first.");
    if (file.size > MAX_SCREENSHOT_BYTES) throw new Error("That image is too large (4 MB maximum). Try a smaller screenshot.");
    await svc.attachAnalyticsScreenshot(u, campaignId, clipId, { bytes: new Uint8Array(await file.arrayBuffer()) });
  });

export const refreshViewsAction = async (campaignId: string, clipId: string, _p: ActionState, _fd: FormData) =>
  run(campaignId, (u) => svc.refreshViews(u, campaignId, clipId));

export const setPctAction = async (campaignId: string, clipId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) => svc.setQualifyingAudiencePct(u, campaignId, clipId, text(fd, "pct")));

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
