import { describe, expect, it } from "vitest";
import {
  SCREENSHOT_VIEWS_LIMIT,
  canSubmitScreenshot,
  computeEconomics,
  hasAnalyticsProof,
} from "@/lib/clips/rules";
import { MAX_SCREENSHOT_BYTES, detectImageKind, validateScreenshot } from "@/lib/clips/image";

const pad = (head: number[], total = 64) => Uint8Array.from([...head, ...new Array(Math.max(0, total - head.length)).fill(0)]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = pad([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

describe("the 10,000-view screenshot rule", () => {
  it("is exactly 10,000, and the boundary is STRICTLY fewer than", () => {
    expect(SCREENSHOT_VIEWS_LIMIT).toBe(10_000);
    expect(canSubmitScreenshot(0)).toBe(true);
    expect(canSubmitScreenshot(9_999)).toBe(true);
    expect(canSubmitScreenshot(10_000)).toBe(false); // 10,000 or more -> video link only
    expect(canSubmitScreenshot(10_001)).toBe(false);
    expect(canSubmitScreenshot(4_000_000)).toBe(false);
  });
});

describe("what counts as analytics proof", () => {
  it("a video link OR a screenshot counts; neither does not", () => {
    expect(hasAnalyticsProof({ videoProofUrl: "https://youtu.be/abc12345678", analyticsScreenshotPathname: null })).toBe(true);
    expect(hasAnalyticsProof({ videoProofUrl: null, analyticsScreenshotPathname: "analytics-proof/c/k/x.png" })).toBe(true);
    expect(hasAnalyticsProof({ videoProofUrl: null, analyticsScreenshotPathname: null })).toBe(false);
    expect(hasAnalyticsProof({ videoProofUrl: null })).toBe(false);
  });

  it("a screenshot unlocks the payout calculation exactly like a video link — at ANY later view count", () => {
    const campaign = { baseRate: 1, divisor: 50, maxPayPerPost: 500, viewMinimum: 1000 };
    const shot = { qualifyingAudiencePct: 25, videoProofUrl: null, analyticsScreenshotPathname: "p.png", campaign };
    // proof was accepted while the clip was tiny, but the clip has since gone huge: still fully valid
    expect(computeEconomics({ ...shot, views: 4_000_000 })).toEqual({ eligible: true, cpm: "0.5000", earnings: "2000.00", payout: "500.00" });
    expect(computeEconomics({ ...shot, views: 5_000 })).toMatchObject({ eligible: true, payout: "2.50" });
    // and with no proof of either kind it's still blocked
    expect(computeEconomics({ ...shot, analyticsScreenshotPathname: null, views: 5_000 })).toEqual({ eligible: false, reason: "no_proof" });
  });
});

describe("screenshot file validation (by magic bytes, never by filename or claimed type)", () => {
  it("recognises PNG, JPEG and WebP", () => {
    expect(detectImageKind(PNG)).toEqual({ contentType: "image/png", ext: "png" });
    expect(detectImageKind(JPEG)).toEqual({ contentType: "image/jpeg", ext: "jpg" });
    expect(detectImageKind(WEBP)).toEqual({ contentType: "image/webp", ext: "webp" });
  });

  it("rejects everything else, including scriptable or lookalike formats", () => {
    const svg = ascii('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    const gif = pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const pdf = ascii("%PDF-1.7 fake fake fake fake");
    const html = ascii("<html><script>alert(1)</script></html>");
    const exe = pad([0x4d, 0x5a]); // "MZ"
    for (const bad of [svg, gif, pdf, html, exe, pad([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])]) {
      expect(detectImageKind(bad)).toBeNull();
      expect(() => validateScreenshot(bad)).toThrow(/PNG, JPEG or WebP/);
    }
  });

  it("rejects empty, too-short and oversized files with friendly messages", () => {
    expect(() => validateScreenshot(new Uint8Array(0))).toThrow(/empty/i);
    expect(detectImageKind(Uint8Array.from([0x89, 0x50]))).toBeNull(); // too short to be anything
    const huge = new Uint8Array(MAX_SCREENSHOT_BYTES + 1);
    huge.set(PNG);
    expect(() => validateScreenshot(huge)).toThrow(/too large/i);
    const justRight = new Uint8Array(MAX_SCREENSHOT_BYTES);
    justRight.set(PNG);
    expect(validateScreenshot(justRight).ext).toBe("png");
  });
});
