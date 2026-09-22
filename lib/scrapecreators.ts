import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { scrapeCreatorsCache } from "../drizzle/schema";
import type { Platform } from "./clips/url";

/**
 * The ONLY module that talks to ScrapeCreators (cost/rate-limit handling and caching live here).
 * Public data lookups only — no OAuth. Response field paths follow docs.scrapecreators.com; the
 * Instagram views fallback below was added after live data showed video_play_count alone is unreliable.
 */

export interface ClipMetadata {
  views: number;
  likes: number;
  thumbnailUrl: string | null;
  caption: string | null;
  /**
   * ScrapeCreators' own "is_video" flag — Instagram-specific. TikTok/YouTube posts our URL parser
   * accepts are always video, so this is always `true` for them. For Instagram it's `false` for a
   * confirmed photo/carousel (no view data exists for that post type at all) and `true` for a real
   * Reel; see lib/clips/rules.ts canSetManualViews, which this flag exists to drive.
   */
  isVideo: boolean | null;
}

export type FetchResult =
  | { ok: true; data: ClipMetadata; fetchedAt: Date; stale: boolean; fromCache: boolean }
  | { ok: false; error: string };

export interface FetchOptions {
  /** Skip the cache freshness check (manual "Refresh views now"). Stale cache is still the fallback. */
  force?: boolean;
  maxCacheAgeMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const BASE = "https://api.scrapecreators.com";
const ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000, 4000];
export const DEFAULT_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1h — not specified in the spec; tunable

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = (o: any, path: string): any => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parse(platform: Platform, j: any): ClipMetadata {
  if (platform === "tiktok") {
    const s = "aweme_detail.statistics";
    return {
      views: num(get(j, `${s}.play_count`)),
      likes: num(get(j, `${s}.digg_count`)),
      caption: str(get(j, "aweme_detail.desc")),
      thumbnailUrl: str(get(j, "aweme_detail.video.cover.url_list.0")),
      isVideo: true,
    };
  }
  if (platform === "instagram") {
    const m = "data.xdt_shortcode_media";
    // ScrapeCreators exposes two view-count fields for video posts/Reels; which one is populated
    // varies by post (observed live: video_play_count came back 0 while video_view_count held the
    // real number), so try both rather than trusting either alone.
    const views = num(get(j, `${m}.video_play_count`)) || num(get(j, `${m}.video_view_count`));
    const isVideoRaw = get(j, `${m}.is_video`);
    return {
      views,
      likes: num(get(j, `${m}.edge_media_preview_like.count`)),
      caption: str(get(j, `${m}.edge_media_to_caption.edges.0.node.text`)),
      thumbnailUrl: str(get(j, `${m}.thumbnail_src`)),
      // A photo/carousel post genuinely has no view data — that's confirmed by is_video, not by
      // views coming back 0 (an unlucky/unpopular real Reel could also be 0).
      isVideo: typeof isVideoRaw === "boolean" ? isVideoRaw : null,
    };
  }
  return {
    views: num(j?.viewCountInt ?? j?.viewCountText),
    likes: num(j?.likeCountInt ?? j?.likeCountText),
    caption: str(j?.title) ?? str(j?.description),
    thumbnailUrl: str(j?.thumbnail),
    isVideo: true,
  };
}

const ENDPOINT: Record<Platform, string> = {
  tiktok: "/v2/tiktok/video",
  instagram: "/v1/instagram/post",
  youtube: "/v1/youtube/video",
};

export async function fetchClipMetadata(url: string, platform: Platform, opts: FetchOptions = {}): Promise<FetchResult> {
  const now = opts.now ?? (() => new Date());
  const [cached] = await db
    .select()
    .from(scrapeCreatorsCache)
    .where(and(eq(scrapeCreatorsCache.platform, platform), eq(scrapeCreatorsCache.url, url)))
    .limit(1);

  const toMeta = (c: NonNullable<typeof cached>): ClipMetadata => ({
    views: c.views,
    likes: c.likes,
    thumbnailUrl: c.thumbnailUrl,
    caption: c.caption,
    isVideo: c.isVideo,
  });

  const maxAge = opts.maxCacheAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;
  if (cached && !opts.force && now().getTime() - cached.fetchedAt.getTime() < maxAge) {
    return { ok: true, data: toMeta(cached), fetchedAt: cached.fetchedAt, stale: false, fromCache: true };
  }

  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastError = "ScrapeCreators request failed";

  if (!apiKey) {
    lastError = "SCRAPECREATORS_API_KEY is not set";
  } else {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        const res = await doFetch(`${BASE}${ENDPOINT[platform]}?url=${encodeURIComponent(url)}`, {
          headers: { "x-api-key": apiKey },
        });
        if (!res.ok) throw new Error(`ScrapeCreators responded ${res.status}`);
        const data = parse(platform, await res.json());
        const fetchedAt = now();
        await db
          .insert(scrapeCreatorsCache)
          .values({ platform, url, ...data, fetchedAt })
          .onConflictDoUpdate({
            target: [scrapeCreatorsCache.platform, scrapeCreatorsCache.url],
            set: { views: data.views, likes: data.likes, thumbnailUrl: data.thumbnailUrl, caption: data.caption, isVideo: data.isVideo, fetchedAt },
          });
        return { ok: true, data, fetchedAt, stale: false, fromCache: false };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt < ATTEMPTS - 1) await sleep(BACKOFF_MS[attempt]);
      }
    }
  }

  // Never throw: fall back to last-known-good so the UI can say "stats may be outdated".
  if (cached) return { ok: true, data: toMeta(cached), fetchedAt: cached.fetchedAt, stale: true, fromCache: true };
  return { ok: false, error: lastError };
}
