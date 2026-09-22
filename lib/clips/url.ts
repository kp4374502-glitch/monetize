export type Platform = "tiktok" | "instagram" | "youtube";

export interface ParsedClipUrl {
  platform: Platform;
  /** Stable post identifier — the same post in different URL spellings yields the same id. */
  postId: string;
  /** Tracking-free URL; this is what gets stored so the (campaign_id, url) unique constraint bites. */
  url: string;
}

const host = (h: string) => h.toLowerCase().replace(/^(www|m|vm|vt)\./, "");

/** Returns null for anything that isn't a recognisable TikTok/Instagram/YouTube post URL. */
export function parseClipUrl(raw: string): ParsedClipUrl | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = host(u.hostname);
  const path = u.pathname.replace(/\/+$/, "");

  if (h === "tiktok.com") {
    const m = path.match(/^\/@([\w.-]+)\/video\/(\d+)$/);
    if (m) return { platform: "tiktok", postId: m[2], url: `https://www.tiktok.com/@${m[1].toLowerCase()}/video/${m[2]}` };
    // short links (vm.tiktok.com/XXXX, tiktok.com/t/XXXX): cannot resolve the real id offline
    const s = path.match(/^\/(?:t\/)?([\w-]{6,})$/);
    if (s && (u.hostname.toLowerCase().startsWith("vm.") || u.hostname.toLowerCase().startsWith("vt.") || path.startsWith("/t/"))) {
      return { platform: "tiktok", postId: `short:${s[1]}`, url: `https://${u.hostname.toLowerCase()}${path}` };
    }
    return null;
  }

  if (h === "instagram.com") {
    // Keep the real post type in the stored URL — /p/ is a photo/carousel, /tv/ is IGTV, and only
    // /reel/ or /reels/ is an actual video Reel. Only "reels" -> "reel" gets normalised (same
    // content, two spellings); rewriting everything to /reel/ made photo carousels look like Reels
    // in the dashboard. Dedup across a post's different URL spellings still works: submitClip
    // matches by postId, not by this exact path.
    const m = path.match(/^(?:\/[\w.]+)?\/(p|reel|reels|tv)\/([\w-]+)$/);
    if (m) {
      const type = m[1] === "reels" ? "reel" : m[1];
      return { platform: "instagram", postId: m[2], url: `https://www.instagram.com/${type}/${m[2]}` };
    }
    return null;
  }

  if (h === "youtube.com" || h === "music.youtube.com") {
    const id =
      path === "/watch" ? u.searchParams.get("v") : path.match(/^\/(?:shorts|embed|live)\/([\w-]{11})$/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) return { platform: "youtube", postId: id, url: `https://www.youtube.com/watch?v=${id}` };
    return null;
  }

  if (h === "youtu.be") {
    const id = path.slice(1);
    if (/^[\w-]{11}$/.test(id)) return { platform: "youtube", postId: id, url: `https://www.youtube.com/watch?v=${id}` };
  }
  return null;
}

/** Analytics-proof links: YouTube (unlisted) or Google Drive only, per docs/PRODUCT_SPEC.md. */
export function isValidProofUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return false;
    const h = host(u.hostname);
    if (h === "youtu.be") return u.pathname.length > 1;
    if (h === "youtube.com") return u.pathname === "/watch" ? !!u.searchParams.get("v") : /^\/(shorts|embed|live)\/[\w-]+/.test(u.pathname);
    if (h === "drive.google.com") return u.pathname.length > 1;
    return false;
  } catch {
    return false;
  }
}
