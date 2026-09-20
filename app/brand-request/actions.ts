"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUserId } from "@/lib/auth/ensure-user";
import { GATE_COOKIE, verifyGateToken } from "@/lib/brand/gate";
import { submitBrandRequest } from "@/lib/brand/service";
import type { ActionState } from "@/components/action-form";

/** Files the request. Requires a signed-in user AND a valid gate cookie (proof they knew the code). */
export async function submitBrandRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    if (!verifyGateToken(process.env.BRAND_SIGNUP_CODE, (await cookies()).get(GATE_COOKIE)?.value)) {
      return { error: "Your access code has expired. Please enter it again." };
    }
    await submitBrandRequest(userId, {
      brandName: fd.get("brandName"),
      discord: fd.get("discord"),
      note: fd.get("note") ?? "",
    });
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Please check the form." };
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
  revalidatePath("/brand-request");
  return { ok: true };
}
