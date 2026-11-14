import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The real module is a "use server" file that pulls in the DB client and Clerk; the forms only need
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

import { ClipHistoryBrowser } from "@/components/clips/clip-history-browser";
import type { ClipRow } from "@/components/clips/clip-parts";

const clip = (over: Partial<ClipRow> = {}) =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    campaignId: "22222222-2222-2222-2222-222222222222",
    creatorUserId: "creator",
    platform: "instagram",
    url: "https://www.instagram.com/p/DfYvK-5GtnY",
    thumbnailUrl: null,
    caption: null,
    views: 0,
    manualViews: null,
    likes: 466,
    lastRefreshedAt: new Date(),
    status: "pending",
    rejectionReason: null,
    qualifyingAudiencePct: null,
    videoProofUrl: "https://drive.google.com/drive/folders/x",
    analyticsScreenshotPathname: null,
    cpm: null,
    earnings: null,
    payout: null,
    paidStatus: "unpaid",
    flaggedDuplicate: false,
    flaggedReason: null,
    clipApproved: true,
    isVideo: false, // an Instagram carousel, as confirmed by ScrapeCreators
    postedAt: new Date(),
    analyticsUnlockedEarlyAt: null,
    submittedAt: new Date(),
    ...over,
  }) as unknown as ClipRow;

const summary = {
  total: 1,
  awaitingAnalytics: 0,
  pending: 1,
  approved: 0,
  rejected: 0,
  paid: 0,
  totalViews: 0,
  approvedViews: 0,
  paidAmount: "0.00",
  owedAmount: "0.00",
};

function render(c: ClipRow, canReview = true) {
  return renderToStaticMarkup(
    createElement(ClipHistoryBrowser, {
      campaignId: "22222222-2222-2222-2222-222222222222",
      basePath: "/campaigns/22222222-2222-2222-2222-222222222222/history",
      status: "all",
      from: "",
      to: "",
      summary,
      rows: [{ clip: c, creatorUsername: "facepelage2", postNumber: 433, creatorPostNumber: 5 }],
      showCreator: canReview,
      canReview,
    }),
  );
}

describe("History page: manual views for Instagram photo/carousel posts", () => {
  it("shows the manual-views form to a reviewer on a pending Instagram carousel", () => {
    const html = render(clip());
    expect(html).toContain('data-testid="manual-views"');
    expect(html).toContain('data-testid="manual-views-input"');
    expect(html).toContain(">Set views<");
  });

  it("offers 'Update views' with the saved number once a count has been entered", () => {
    const html = render(clip({ manualViews: 42_000 }));
    expect(html).toContain(">Update views<");
    expect(html).toContain('value="42000"');
  });

  it("still shows it on an approved, unpaid carousel", () => {
    expect(render(clip({ status: "approved" }))).toContain('data-testid="manual-views"');
  });

  it("is never offered for a real video, an unconfirmed post, or another platform", () => {
    expect(render(clip({ isVideo: true }))).not.toContain('data-testid="manual-views"');
    expect(render(clip({ isVideo: null }))).not.toContain('data-testid="manual-views"');
    expect(render(clip({ platform: "tiktok", isVideo: true }))).not.toContain('data-testid="manual-views"');
  });

  it("is hidden once the post is paid or rejected (the server refuses a paid post)", () => {
    expect(render(clip({ status: "approved", paidStatus: "paid" }))).not.toContain('data-testid="manual-views"');
    expect(render(clip({ status: "rejected", rejectionReason: "no" }))).not.toContain('data-testid="manual-views"');
  });

  it("is hidden from a creator viewing their own history", () => {
    expect(render(clip(), false)).not.toContain('data-testid="manual-views"');
  });
});
