import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The real module is a "use server" file that pulls in the DB client and Clerk; the buttons only need
// *some* function to bind to, so any export resolves to a no-op.
vi.mock(
  "@/app/campaigns/clip-actions",
  () =>
    new Proxy(
      {},
      {
        has: () => true,
        get: (_t, key) => (key === "then" ? undefined : key === "__esModule" ? true : async () => ({})),
      },
    ),
);

import { ReviewQueue } from "@/components/clips/review-queue";
import type { ClipRow } from "@/components/clips/clip-parts";

const clip = (over: Partial<ClipRow> = {}) =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    campaignId: "22222222-2222-2222-2222-222222222222",
    creatorUserId: "creator",
    platform: "instagram",
    url: "https://www.instagram.com/reel/AAAAAAAAAAA",
    thumbnailUrl: null,
    caption: null,
    views: 5000,
    manualViews: null,
    likes: 10,
    lastRefreshedAt: new Date(),
    status: "pending",
    rejectionReason: null,
    qualifyingAudiencePct: null,
    videoProofUrl: null,
    analyticsScreenshotPathname: null,
    cpm: "0.1000",
    earnings: "0.50",
    payout: "0.50",
    paidStatus: "unpaid",
    flaggedDuplicate: false,
    flaggedReason: null,
    clipApproved: false,
    isVideo: true,
    postedAt: new Date(),
    ...over,
  }) as unknown as ClipRow;

const row = (c: ClipRow) => ({ clip: c, creatorUsername: "maxmod", postNumber: 1, creatorPostNumber: 1 });

function render(requireAnalyticsProof: boolean) {
  return renderToStaticMarkup(
    createElement(ReviewQueue, {
      campaignId: "22222222-2222-2222-2222-222222222222",
      pending: [row(clip())],
      awaitingPayment: [row(clip({ id: "33333333-3333-3333-3333-333333333333", status: "approved" }))],
      canClipApprove: true, // Owner/Admin
      canMarkPaid: true,
      requireAnalyticsProof,
    }),
  );
}

describe("review queue buttons: campaign without analytics (Efootball)", () => {
  const html = render(false);

  it("shows a plain Approve, and no Analytics Approve", () => {
    expect(html).toContain(">Approve<");
    expect(html).not.toContain("Analytics Approve");
  });

  it("hides Post Approve from Owner/Admin — one approval step only", () => {
    expect(html).not.toContain("Post Approve");
    expect(html).not.toContain('data-testid="clip-approve"');
  });

  it("keeps Reject and Mark paid, and shows no proof line or audience % box", () => {
    expect(html).toContain(">Reject<");
    expect(html).toContain(">Mark paid<");
    expect(html).not.toMatch(/Analytics proof missing/);
    expect(html).not.toContain("Qualifying audience");
  });
});

describe("review queue buttons: campaign with analytics (every other campaign)", () => {
  const html = render(true);

  it("is unchanged: Analytics Approve and Post Approve are both offered", () => {
    expect(html).toContain("Analytics Approve");
    expect(html).toContain("Post Approve");
  });

  it("still asks for the proof and the audience %", () => {
    expect(html).toContain("Analytics proof missing");
    expect(html).toContain("Qualifying audience");
  });
});
