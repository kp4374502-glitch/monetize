"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/ensure-user";
import { reviewBrandRequest } from "@/lib/brand/service";
import type { ActionState } from "@/components/action-form";

/** Platform Owner only (enforced in the service). */
export async function reviewBrandRequestAction(
  requestId: string,
  decision: "approved" | "rejected",
  _prev: ActionState,
  _fd: FormData,
): Promise<ActionState> {
  try {
    await reviewBrandRequest(await requireUserId(), requestId, decision);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
  revalidatePath("/brand-requests");
  revalidatePath("/", "layout");
  return { ok: true };
}
