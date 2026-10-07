"use server";

import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import * as svc from "@/lib/creators/service";

export type ActionResult = { ok: true } | { ok: false; error: string };

function message(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    const first = (err as { issues: { message?: string }[] }).issues[0];
    if (first?.message) return first.message;
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export async function saveCreatorProfileAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await svc.saveCreatorProfile(userId, input);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function recordDiscordJoinAction(): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await svc.recordDiscordJoinClick(userId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/** Only same-site paths are honoured, so redirect_url can't send a new creator off to another site. */
function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/explore";
}

export async function completeOnboardingAction(next?: string): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await svc.completeOnboarding(userId);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  redirect(safeNext(next));
}
