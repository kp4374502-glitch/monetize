import { z } from "zod";

/**
 * Campaign channels: the fixed set of rooms every campaign page shows (mirroring the Discord server,
 * minus chat and submit-your-posts, which the page already covers). Shared by the client panel and the
 * server (the real check), so this file must stay free of db/server imports.
 */

export const CHANNEL_IDS = [
  "announcements",
  "post_requirements",
  "cpm_calculation",
  "bonus",
  "link_in_bio_cta",
  "content_brief",
  "content_example",
  "assets",
  "how_to_submit_posts",
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

/** Discord-style names shown in the panel. */
export const CHANNEL_NAMES: Record<ChannelId, string> = {
  announcements: "announcements",
  post_requirements: "post-requirements",
  cpm_calculation: "cpm-calculation",
  bonus: "bonus",
  link_in_bio_cta: "link-in-bio-cta",
  content_brief: "content-brief",
  content_example: "content-example",
  assets: "assets",
  how_to_submit_posts: "how-to-submit-posts",
};

/** The one channel whose new posts ping every creator on the campaign's bell. */
export const ANNOUNCEMENTS_CHANNEL: ChannelId = "announcements";

export const MAX_LINKS_PER_POST = 3;

/** Only http(s): a "javascript:" or "data:" link must never become a clickable href. */
export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" || url.protocol === "http:";
}

const linkSchema = z.object({
  url: z.string().trim().max(2000, "That link is too long").refine(isHttpUrl, "Links must start with http:// or https://"),
  label: z.string().trim().max(60, "Keep link labels under 60 characters"),
});

export const channelPostBodySchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(120, "Keep the title under 120 characters"),
  body: z.string().trim().min(1, "Write a message").max(4000, "Keep the message under 4,000 characters"),
  links: z.array(linkSchema).max(MAX_LINKS_PER_POST, `Add at most ${MAX_LINKS_PER_POST} links`),
});

export const channelPostSchema = channelPostBodySchema.extend({
  channel: z.enum(CHANNEL_IDS, { error: "Pick a channel" }),
});

/** Text shown on a link button: the label if given, else the site's name. */
export function linkText(link: { url: string; label: string }): string {
  if (link.label) return link.label;
  try {
    return new URL(link.url).hostname.replace(/^www\./, "");
  } catch {
    return link.url;
  }
}

/** The post form's link rows (linkUrl1/linkLabel1 ...): blank rows are dropped. */
export function linksFromFormData(fd: FormData): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (let i = 1; i <= MAX_LINKS_PER_POST; i++) {
    const url = String(fd.get(`linkUrl${i}`) ?? "").trim();
    if (!url) continue;
    out.push({ url, label: String(fd.get(`linkLabel${i}`) ?? "") });
  }
  return out;
}
