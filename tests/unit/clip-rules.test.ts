import { describe, expect, it } from "vitest";
import {
  canSetManualViews,
  computeEconomics,
  duplicateFlag,
  effectiveViews,
  roleCanMarkPaid,
  roleCanOverride,
  startOfUtcDay,
  wouldExceedBudget,
} from "@/lib/clips/rules";
import { isValidProofUrl, parseClipUrl } from "@/lib/clips/url";

const campaign = { baseRate: 1, divisor: 50, maxPayPerPost: 500, viewMinimum: 1000 };

describe("budget cap", () => {
  it("allows a payout that lands exactly on the cap", () => {
    expect(wouldExceedBudget("900.00", "100.00", "1000.00")).toBe(false);
  });
  it("rejects a payout that would exceed the cap by a cent", () => {
    expect(wouldExceedBudget("900.00", "100.01", "1000.00")).toBe(true);
  });
  it("is exact in cents (no floating point drift)", () => {
    expect(wouldExceedBudget("0.10", "0.20", "0.30")).toBe(false);
  });
});

describe("Mod mark-paid threshold", () => {
  it("lets a Mod mark paid at or below the threshold only", () => {
    expect(roleCanMarkPaid("mod", "50.00", "50")).toBe(true);
    expect(roleCanMarkPaid("mod", "50.01", "50")).toBe(false);
  });
  it("has no limit for Admin/Owner, and never lets a Creator", () => {
    expect(roleCanMarkPaid("admin", "99999", "50")).toBe(true);
    expect(roleCanMarkPaid("owner", "99999", "50")).toBe(true);
    expect(roleCanMarkPaid("creator", "1", "50")).toBe(false);
  });
});

describe("override rules", () => {
  it("a Mod can act on an untouched clip or their own decision, never another reviewer's", () => {
    expect(roleCanOverride("mod", "m1", null)).toBe(true);
    expect(roleCanOverride("mod", "m1", "m1")).toBe(true);
    expect(roleCanOverride("mod", "m1", "m2")).toBe(false);
    expect(roleCanOverride("mod", "m1", "admin1")).toBe(false);
  });
  it("Admin/Owner can override anyone", () => {
    expect(roleCanOverride("admin", "a", "m2")).toBe(true);
    expect(roleCanOverride("owner", "o", "m2")).toBe(true);
  });
});

describe("duplicate flag", () => {
  it("flags a post already submitted by a different creator, without naming them", () => {
    const r = duplicateFlag("c1", [{ creatorUserId: "c2" }]);
    expect(r.reason).toMatch(/another creator/);
    expect(r.reason).not.toMatch(/c2/);
    expect(r.sameCreator).toBe(false);
  });
  it("reports same-creator matches and no flag when there are none", () => {
    expect(duplicateFlag("c1", [{ creatorUserId: "c1" }]).sameCreator).toBe(true);
    expect(duplicateFlag("c1", []).reason).toBeNull();
  });
});

describe("computeEconomics gating", () => {
  const base = { views: 4_000_000, qualifyingAudiencePct: 25, videoProofUrl: "https://youtu.be/abcdefghijk", campaign };
  it("matches the spec's worked example: capped at $500", () => {
    expect(computeEconomics(base)).toEqual({ eligible: true, cpm: "0.5000", earnings: "2000.00", payout: "500.00" });
  });
  it("earns nothing without proof, without a %, or below the view minimum", () => {
    expect(computeEconomics({ ...base, videoProofUrl: null })).toEqual({ eligible: false, reason: "no_proof" });
    expect(computeEconomics({ ...base, qualifyingAudiencePct: null })).toEqual({ eligible: false, reason: "no_pct" });
    expect(computeEconomics({ ...base, views: 999 })).toEqual({ eligible: false, reason: "below_view_minimum" });
    expect(computeEconomics({ ...base, views: 1000 }).eligible).toBe(true);
  });
  it("keeps cpm at 4 decimals and rounds earnings/payout to cents", () => {
    const r = computeEconomics({ ...base, qualifyingAudiencePct: 33, views: 12_345 });
    // cpm = 33/50 = 0.66; earnings = 0.66 * 12.345 = 8.1477 -> 8.15
    expect(r).toEqual({ eligible: true, cpm: "0.6600", earnings: "8.15", payout: "8.15" });
  });
});

describe("UTC day boundary", () => {
  it("resets at midnight UTC", () => {
    expect(startOfUtcDay(new Date("2026-09-19T23:59:59Z")).toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });
});

describe("clip URL parsing", () => {
  it("normalises equivalent spellings of one post to the same stored URL and id", () => {
    const a = parseClipUrl("https://youtu.be/dQw4w9WgXcQ?si=track")!;
    const b = parseClipUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")!;
    const c = parseClipUrl("http://m.youtube.com/watch?v=dQw4w9WgXcQ&utm=1")!;
    expect([a.url, b.url, c.url]).toEqual(Array(3).fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    expect(a.postId).toBe("dQw4w9WgXcQ");
  });
  it("recognises TikTok and Instagram posts and strips tracking params", () => {
    expect(parseClipUrl("https://www.tiktok.com/@Some.User/video/7301234567890?is_from_webapp=1")).toMatchObject({
      platform: "tiktok",
      postId: "7301234567890",
    });
    expect(parseClipUrl("https://instagram.com/reels/C1aBcDeFgH/?igsh=x")).toMatchObject({
      platform: "instagram",
      postId: "C1aBcDeFgH",
    });
  });
  it("keeps the real Instagram post type in the stored URL — a photo/carousel or IGTV link is never rewritten to look like a Reel", () => {
    // /reels/ (plural) is just a spelling variant of /reel/ — same content, normalised.
    expect(parseClipUrl("https://www.instagram.com/reels/C1aBcDeFgH/")).toMatchObject({ url: "https://www.instagram.com/reel/C1aBcDeFgH" });
    expect(parseClipUrl("https://www.instagram.com/reel/C1aBcDeFgH/")).toMatchObject({ url: "https://www.instagram.com/reel/C1aBcDeFgH" });
    // /p/ (photo/carousel) and /tv/ (IGTV) are a different post type and must stay distinguishable.
    expect(parseClipUrl("https://www.instagram.com/p/C1aBcDeFgH/")).toMatchObject({ url: "https://www.instagram.com/p/C1aBcDeFgH" });
    expect(parseClipUrl("https://www.instagram.com/tv/C1aBcDeFgH/")).toMatchObject({ url: "https://www.instagram.com/tv/C1aBcDeFgH" });
  });
  it("rejects non-post and non-supported URLs", () => {
    for (const u of ["https://example.com/x", "not a url", "https://www.tiktok.com/@u", "javascript:alert(1)", "https://youtube.com/watch"]) {
      expect(parseClipUrl(u)).toBeNull();
    }
  });
  it("accepts only YouTube/Drive proof links over https", () => {
    expect(isValidProofUrl("https://youtu.be/abc123")).toBe(true);
    expect(isValidProofUrl("https://drive.google.com/file/d/xyz/view")).toBe(true);
    expect(isValidProofUrl("http://youtu.be/abc123")).toBe(false);
    expect(isValidProofUrl("https://evil.com/youtu.be/abc")).toBe(false);
  });
});

describe("manual view entry (Instagram photo/carousel posts)", () => {
  it("effectiveViews: a manual entry wins over the auto-fetched number, including an explicit 0", () => {
    expect(effectiveViews({ views: 0, manualViews: 42_000 })).toBe(42_000);
    expect(effectiveViews({ views: 0, manualViews: 0 })).toBe(0);
    expect(effectiveViews({ views: 5000, manualViews: null })).toBe(5000);
  });

  it("canSetManualViews: only an Instagram post ScrapeCreators has confirmed is NOT a video", () => {
    expect(canSetManualViews({ platform: "instagram", isVideo: false })).toBe(true);
    expect(canSetManualViews({ platform: "instagram", isVideo: true })).toBe(false);
    // null = never successfully fetched, or not applicable — not confirmed either way, so refused.
    expect(canSetManualViews({ platform: "instagram", isVideo: null })).toBe(false);
    expect(canSetManualViews({ platform: "tiktok", isVideo: null })).toBe(false);
    expect(canSetManualViews({ platform: "youtube", isVideo: null })).toBe(false);
  });
});
