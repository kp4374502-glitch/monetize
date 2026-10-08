"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUserId } from "@/lib/auth/ensure-user";
import * as svc from "@/lib/channels/service";
import { linksFromFormData } from "@/lib/channels/schemas";
import type { ActionState } from "@/components/action-form";

/** Same shape as clip-actions' helper: business-rule errors become a message the form can show. */
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
const postFields = (fd: FormData) => ({ title: text(fd, "title"), body: text(fd, "body"), links: linksFromFormData(fd) });

/** Owner/Admin only (enforced in the service). */
export const createChannelPostAction = async (campaignId: string, channel: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) => svc.createChannelPost(u, campaignId, { channel, ...postFields(fd) }));

export const updateChannelPostAction = async (campaignId: string, postId: string, _p: ActionState, fd: FormData) =>
  run(campaignId, (u) => svc.updateChannelPost(u, campaignId, postId, postFields(fd)));

export const deleteChannelPostAction = async (campaignId: string, postId: string, _p: ActionState, _fd: FormData) =>
  run(campaignId, (u) => svc.deleteChannelPost(u, campaignId, postId));

/** Called when a viewer opens a channel. It doesn't revalidate: the panel already cleared its badge locally. */
export async function markChannelReadAction(campaignId: string, channel: string): Promise<void> {
  try {
    await svc.markChannelRead(await requireUserId(), campaignId, channel);
  } catch {
    // a failed "mark as read" is harmless: the badge just shows again on the next visit
  }
}
