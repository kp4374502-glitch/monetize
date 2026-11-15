"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUserId } from "@/lib/auth/ensure-user";
import * as campaigns from "@/lib/campaigns/service";
import * as team from "@/lib/team/service";
import type { ActionState } from "@/components/action-form";

/** Role assignment. Business-rule errors come back as a message the form shows; every rule is enforced in the services. */
async function run(paths: string[], fn: (userId: string) => Promise<unknown>, message?: string): Promise<ActionState> {
  try {
    await fn(await requireUserId());
  } catch (e) {
    // A ZodError's .message is a JSON dump; show the first rule that failed instead.
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Invalid input." };
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
}

const username = (fd: FormData) => String(fd.get("username") ?? "").trim();

// ---- per campaign: Mod/CPE and Brand viewer (Owner/Admin) ----------------------------------------
export const addModAction = async (campaignId: string, _p: ActionState, fd: FormData) =>
  run([`/campaigns/${campaignId}`], (u) => campaigns.addMod(u, campaignId, username(fd)), "Added as Mod/CPE.");

export const removeModAction = async (campaignId: string, modRowId: string, _p: ActionState, _fd: FormData) =>
  run([`/campaigns/${campaignId}`], (u) => campaigns.removeMod(u, campaignId, modRowId));

export const addBrandViewerAction = async (campaignId: string, _p: ActionState, fd: FormData) =>
  run([`/campaigns/${campaignId}`], (u) => campaigns.addBrand(u, campaignId, username(fd)), "Added as Brand viewer.");

export const removeBrandViewerAction = async (campaignId: string, brandRowId: string, _p: ActionState, _fd: FormData) =>
  run([`/campaigns/${campaignId}`], (u) => campaigns.removeBrand(u, campaignId, brandRowId));

// ---- campaign settings: name and brand name (Owner/Admin) ---------------------------------------
export const updateDetailsAction = async (campaignId: string, _p: ActionState, fd: FormData) =>
  run(
    [`/campaigns/${campaignId}`, `/campaigns/${campaignId}/history`, "/explore", "/"],
    (u) => campaigns.updateCampaignDetails(u, campaignId, { brandName: fd.get("brandName"), name: fd.get("name") }),
    "Saved.",
  );

// ---- campaign settings: eligible platforms (Owner/Admin) ----------------------------------------
export const setPlatformsAction = async (campaignId: string, _p: ActionState, fd: FormData) =>
  run([`/campaigns/${campaignId}`, "/explore"], (u) => campaigns.setEligiblePlatforms(u, campaignId, fd.getAll("eligiblePlatforms")), "Saved.");

// ---- platform-wide Admin (platform Owner only) ----------------------------------------------------
export const addAdminAction = async (_p: ActionState, fd: FormData) =>
  run(["/team"], (u) => team.addPlatformAdmin(u, username(fd)), "Added as Admin.");

export const removeAdminAction = async (userId: string, _p: ActionState, _fd: FormData) =>
  run(["/team"], (u) => team.removePlatformAdmin(u, userId));
