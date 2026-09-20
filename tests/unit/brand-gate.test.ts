import { describe, expect, it } from "vitest";
import { GATE_TTL_SECONDS, clientIp, safeEqual, signGateToken, verifyGateToken } from "@/lib/brand/gate";

const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);

describe("gate token", () => {
  it("verifies a fresh token signed with the same secret", () => {
    expect(verifyGateToken("s3cret", signGateToken("s3cret", NOW), NOW + 1000)).toBe(true);
  });

  it("expires after the TTL", () => {
    const t = signGateToken("s3cret", NOW);
    expect(verifyGateToken("s3cret", t, NOW + (GATE_TTL_SECONDS - 1) * 1000)).toBe(true);
    expect(verifyGateToken("s3cret", t, NOW + (GATE_TTL_SECONDS + 1) * 1000)).toBe(false);
  });

  it("rejects a token signed with a different secret (also revokes cookies when the code rotates)", () => {
    expect(verifyGateToken("new-code", signGateToken("old-code", NOW), NOW)).toBe(false);
  });

  it("rejects tampered expiry, garbage, missing token and a missing secret", () => {
    const [exp, sig] = signGateToken("s3cret", NOW).split(".");
    expect(verifyGateToken("s3cret", `${Number(exp) + 99999}.${sig}`, NOW)).toBe(false);
    for (const bad of ["", "abc", "1.2.3", ".", "12345.", ".abc", undefined]) {
      expect(verifyGateToken("s3cret", bad, NOW)).toBe(false);
    }
    expect(verifyGateToken(undefined, signGateToken("s3cret", NOW), NOW)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares equal and unequal strings, including different lengths, without throwing", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcdef")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("clientIp", () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
  it("prefers the first x-forwarded-for hop, then x-real-ip, then 'unknown'", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(h({}))).toBe("unknown");
  });
});
