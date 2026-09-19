"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUserId } from "@/lib/auth/ensure-user";
import * as svc from "@/lib/clips/service";
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
