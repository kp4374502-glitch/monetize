import { describe, expect, it } from "vitest";
import { parse } from "@/lib/scrapecreators";

describe("Instagram views parsing", () => {
  it("uses video_play_count when present", () => {
    const j = { data: { xdt_shortcode_media: { video_play_count: 12000, video_view_count: 9000, edge_media_preview_like: { count: 40 } } } };
    expect(parse("instagram", j).views).toBe(12000);
  });

  it("falls back to video_view_count when video_play_count is 0/missing — real bug: a live Reel came back with 653 likes and 0 views because only video_play_count was read", () => {
    const j = { data: { xdt_shortcode_media: { video_play_count: 0, video_view_count: 84213, edge_media_preview_like: { count: 653 } } } };
    const r = parse("instagram", j);
    expect(r.views).toBe(84213);
    expect(r.likes).toBe(653);
  });

  it("is 0 when neither field is present (e.g. a photo post with no video component)", () => {
    const j = { data: { xdt_shortcode_media: { edge_media_preview_like: { count: 10 } } } };
    expect(parse("instagram", j).views).toBe(0);
  });
});

describe("isVideo (drives manual view entry)", () => {
  it("TikTok and YouTube are always video", () => {
    expect(parse("tiktok", {}).isVideo).toBe(true);
    expect(parse("youtube", {}).isVideo).toBe(true);
  });

  it("Instagram: reads the real is_video flag from ScrapeCreators — false for a confirmed photo/carousel", () => {
    const carousel = { data: { xdt_shortcode_media: { is_video: false, edge_media_preview_like: { count: 10 } } } };
    expect(parse("instagram", carousel).isVideo).toBe(false);
    const reel = { data: { xdt_shortcode_media: { is_video: true, video_play_count: 500, edge_media_preview_like: { count: 10 } } } };
    expect(parse("instagram", reel).isVideo).toBe(true);
  });

  it("Instagram: null when the field is missing, rather than assuming either way", () => {
    const j = { data: { xdt_shortcode_media: { edge_media_preview_like: { count: 10 } } } };
    expect(parse("instagram", j).isVideo).toBeNull();
  });
});
