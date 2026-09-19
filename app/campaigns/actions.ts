"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/ensure-user";
import * as svc from "@/lib/campaigns/service";

function parseCampaignForm(fd: FormData) {
  return {
    brandName: fd.get("brandName"),
    name: fd.get("name"),
    baseRate: fd.get("baseRate"),
    divisor: fd.get("divisor") || undefined,
    maxPayPerPost: fd.get("maxPayPerPost"),
    viewMinimum: fd.get("viewMinimum") || undefined,
    totalBudget: fd.get("totalBudget"),
    modMarkPaidThreshold: fd.get("modMarkPaidThreshold"),
    dailySubmissionLimit: fd.get("dailySubmissionLimit") || undefined,
    eligiblePlatforms: fd.getAll("eligiblePlatforms"),
  };
}

export async function createCampaignAction(fd: FormData) {
  const userId = await requireUserId();
  const campaign = await svc.createCampaign(userId, parseCampaignForm(fd));
  redirect(`/campaigns/${campaign.id}`);
}

export async function updateCampaignSettingsAction(campaignId: string, fd: FormData) {
  const userId = await requireUserId();
  await svc.updateCampaignSettings(userId, campaignId, parseCampaignForm(fd));
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function setLifecycleAction(campaignId: string, action: "pause" | "close" | "archive" | "reopen") {
  const userId = await requireUserId();
  const fn = { pause: svc.pauseCampaign, close: svc.closeCampaign, archive: svc.archiveCampaign, reopen: svc.reopenCampaign }[action];
  await fn(userId, campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function deleteCampaignAction(campaignId: string) {
  const userId = await requireUserId();
  await svc.deleteCampaign(userId, campaignId);
  redirect("/");
}

export async function generateInviteLinkAction(campaignId: string) {
  const userId = await requireUserId();
  await svc.generateInviteLink(userId, campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function revokeInviteLinkAction(campaignId: string, linkId: string) {
  const userId = await requireUserId();
  await svc.revokeInviteLink(userId, campaignId, linkId);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function redeemInviteAction(code: string) {
  const userId = await requireUserId();
  const campaign = await svc.redeemInvite(userId, code);
  redirect(`/campaigns/${campaign.id}`);
}
