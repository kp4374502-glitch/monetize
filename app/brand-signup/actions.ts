"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { GATE_COOKIE, GATE_TTL_SECONDS, checkBrandCode, clientIp, signGateToken } from "@/lib/brand/gate";
import type { ActionState } from "@/components/action-form";

const messages = {
  wrong: "That code isn't right.",
  locked: "Too many attempts. Please try again in 15 minutes.",
  disabled: "Brand sign-up isn't open right now.",
} as const;

/** Checks the shared code; on success sets a signed, httpOnly cookie and reloads the page. */
export async function verifyBrandCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const result = await checkBrandCode(String(fd.get("code") ?? ""), clientIp(await headers()));
  if (!result.ok) return { error: messages[result.reason] };

  (await cookies()).set(GATE_COOKIE, signGateToken(process.env.BRAND_SIGNUP_CODE!), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_TTL_SECONDS,
  });
  redirect("/brand-signup");
}

/** "Use a different code": forget the accepted code so the code box is shown again. */
export async function resetBrandGateAction() {
  (await cookies()).delete(GATE_COOKIE);
  redirect("/brand-signup");
}
