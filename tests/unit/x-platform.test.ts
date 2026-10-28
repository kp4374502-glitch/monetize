import { describe, expect, it } from "vitest";
import { parseClipUrl } from "@/lib/clips/url";
import { parse } from "@/lib/scrapecreators";
import { PLATFORMS, PLATFORM_LABELS, eligiblePlatformsSchema } from "@/lib/campaigns/schemas";

describe("X post links", () => {
  const id = "2113776971603689874";

  it("accepts x.com and twitter.com in every common spelling and gives the same post id and URL", () => {
    const spellings = [
      `https://x.com/NASA/status/${id}`,
      `https://twitter.com/NASA/status/${id}`,
      `https://www.x.com/nasa/status/${id}?s=20&t=abc`,
      `https://mobile.twitter.com/NASA/status/${id}/`,
      `https://x.com/NASA/status/${id}/photo/1`,
      `https://x.com/NASA/status/${id}/video/1`,
      `http://x.com/NASA/statuses/${id}`,
    ];
    for (const raw of spellings) {
      expect(parseClipUrl(raw), raw).toEqual({ platform: "x", postId: id, url: `https://x.com/nasa/status/${id}` });
    }
  });

  it("accepts the handle-less share forms", () => {
    expect(parseClipUrl(`https://x.com/i/status/${id}`)).toEqual({ platform: "x", postId: id, url: `https://x.com/i/status/${id}` });
    expect(parseClipUrl(`https://x.com/i/web/status/${id}`)).toEqual({ platform: "x", postId: id, url: `https://x.com/i/status/${id}` });
  });

  it("rejects anything that isn't a single post", () => {
    for (const raw of [
      "https://x.com/NASA",
      "https://x.com/NASA/likes",
      "https://x.com/search?q=nasa",
      "https://x.com/NASA/status/abc",
      "https://x.com/NASA/status/12",
      "https://nottwitter.com/NASA/status/2113776971603689874",
      "https://x.com.evil.example/NASA/status/2113776971603689874",
      "javascript:alert(1)",
    ]) {
      expect(parseClipUrl(raw), raw).toBeNull();
    }
  });

  it("leaves the other three platforms parsing exactly as before", () => {
    expect(parseClipUrl("https://www.tiktok.com/@u/video/111")?.platform).toBe("tiktok");
    expect(parseClipUrl("https://www.instagram.com/reel/De4SZgJyLpI/")?.platform).toBe("instagram");
    expect(parseClipUrl("https://youtu.be/t2gFevv5KN4")?.platform).toBe("youtube");
  });
});

describe("X metadata parsing (shapes confirmed live against /v1/twitter/tweet)", () => {
  it("reads views, likes, caption, thumbnail and the real publish date", () => {
    const j = {
      rest_id: "2113776971603689874",
      views: { count: "1350083", state: "EnabledWithCount" },
      legacy: {
        favorite_count: 7850,
        created_at: "Fri Oct 23 23:37:56 +0000 2026",
        full_text: "We are not slowing down.",
        extended_entities: { media: [{ type: "video", media_url_https: "https://pbs.twimg.com/media/a.jpg" }] },
      },
    };
    const r = parse("x", j);
    expect(r).toMatchObject({ views: 1350083, likes: 7850, caption: "We are not slowing down.", thumbnailUrl: "https://pbs.twimg.com/media/a.jpg", isVideo: true });
    expect(r.postedAt?.toISOString()).toBe("2026-10-23T23:37:56.000Z");
  });

  it("falls back to entities.media for the thumbnail, and is 0 views (not an error) when X gives no count", () => {
    const j = {
      views: { state: "Enabled" }, // what an old post returns: no count at all
      legacy: { favorite_count: 4177421, created_at: "Thu Apr 28 00:56:58 +0000 2022", full_text: "text only", entities: { media: [{ media_url_https: "https://pbs.twimg.com/b.jpg" }] } },
    };
    const r = parse("x", j);
    expect(r.views).toBe(0);
    expect(r.likes).toBe(4177421);
    expect(r.thumbnailUrl).toBe("https://pbs.twimg.com/b.jpg");
  });

  it("never throws on an empty or unexpected body", () => {
    expect(parse("x", {})).toMatchObject({ views: 0, likes: 0, caption: null, thumbnailUrl: null, postedAt: null, isVideo: true });
    expect(parse("x", { legacy: { created_at: "not a date" } }).postedAt).toBeNull();
  });
});

describe("platform list", () => {
  it("offers TikTok, Instagram, YouTube and X, each with a label", () => {
    expect([...PLATFORMS]).toEqual(["tiktok", "instagram", "youtube", "x"]);
    expect(PLATFORM_LABELS.x).toBe("X");
  });
  it("needs at least one platform and refuses unknown ones", () => {
    expect(eligiblePlatformsSchema.safeParse(["x"]).success).toBe(true);
    expect(eligiblePlatformsSchema.safeParse([]).success).toBe(false);
    expect(eligiblePlatformsSchema.safeParse(["facebook"]).success).toBe(false);
  });
});
