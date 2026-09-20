import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db } from "../db/client";
import { brandSignupAttempts } from "../../drizzle/schema";

/**
 * The shared-secret gate in front of the Brand sign-up form. The secret is BRAND_SIGNUP_CODE.
 * Passing the gate sets a short-lived signed cookie; guessing is limited per IP in the database.
 */

export const GATE_COOKIE = "brand_gate";
export const GATE_TTL_SECONDS = 60 * 60; // the cookie proves "knew the code" for one hour
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** Constant-time string comparison (hashing first makes the lengths equal). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("hex");

/** `<expiry-unix-seconds>.<hmac>` — unforgeable without the code, and rotating the code revokes it. */
export function signGateToken(secret: string, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + GATE_TTL_SECONDS;
  return `${exp}.${sign(secret, String(exp))}`;
}

export function verifyGateToken(secret: string | undefined, token: string | undefined, nowMs: number = Date.now()): boolean {
  if (!secret || !token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 <= nowMs) return false;
  return safeEqual(sig, sign(secret, exp));
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(h: { get(name: string): string | null }): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

export type CodeCheck = { ok: true } | { ok: false; reason: "disabled" | "locked" | "wrong" };

/**
 * Checks a submitted code. A locked-out IP is refused WITHOUT looking at the code, so a correct guess
 * can't be used to probe the lock. Failures are recorded; success clears that IP's failures.
 */
export async function checkBrandCode(
  input: string,
  ip: string,
  opts: { secret?: string | undefined; now?: Date } = {},
): Promise<CodeCheck> {
  const secret = "secret" in opts ? opts.secret : process.env.BRAND_SIGNUP_CODE;
  if (!secret) return { ok: false, reason: "disabled" };
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - LOCKOUT_WINDOW_MS);

  const [{ n }] = await db
    .select({ n: count() })
    .from(brandSignupAttempts)
    .where(and(eq(brandSignupAttempts.ip, ip), gt(brandSignupAttempts.createdAt, since)));
  if (n >= MAX_FAILED_ATTEMPTS) return { ok: false, reason: "locked" };

  if (safeEqual(input.trim(), secret)) {
    await db.delete(brandSignupAttempts).where(eq(brandSignupAttempts.ip, ip));
    return { ok: true };
  }

  await db.insert(brandSignupAttempts).values({ ip, createdAt: now });
  // opportunistic cleanup so the table can't grow without bound
  await db.delete(brandSignupAttempts).where(lt(brandSignupAttempts.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  return { ok: false, reason: "wrong" };
}
