import { z } from "zod";
import { COUNTRIES, DIAL_CODES } from "./countries";

/**
 * Creator onboarding input rules. Shared by the client wizard (to enable/disable Next) and the server
 * actions (the real check) — so this file must stay free of db/server imports.
 */

export const GENDERS = ["male", "female", "non_binary", "prefer_not_to_say"] as const;
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

export const CREATOR_TYPES = ["faceless", "face"] as const;

export const SOCIAL_PLATFORMS = ["tiktok", "instagram", "youtube", "x", "snapchat", "facebook"] as const;
export const SOCIAL_LABELS: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  snapchat: "Snapchat",
  facebook: "Facebook",
};

export const LANGUAGES = [
  "English", "Spanish", "Portuguese", "French", "German", "Italian", "Hindi", "Arabic", "Indonesian",
  "Turkish", "Russian", "Japanese", "Korean", "Chinese", "Other",
] as const;

/** Max showcase video links (the "Showcase Your Best Work" step). */
export const MAX_SHOWCASE_URLS = 3;
/** Max social accounts one creator can list. */
export const MAX_SOCIALS = 10;

// Hosts accepted for showcase links: the platforms named on that step.
const SHOWCASE_HOSTS = [
  "tiktok.com", "instagram.com", "youtube.com", "youtu.be", "snapchat.com", "facebook.com", "fb.watch", "x.com", "twitter.com",
];

export function isShowcaseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return SHOWCASE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const countryNames = new Set(COUNTRIES.map((c) => c.name));

/** Validates a YYYY-MM-DD date that is a real calendar day, in the past, and not before 1900. */
function isPlausibleBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  return d.getUTCFullYear() >= 1900 && d.getTime() < Date.now();
}

/**
 * A Discord handle: 2-32 letters, numbers, dots or underscores (a leading @ is dropped); the old
 * "name#1234" form is still accepted. Required so the team can find the creator in the server.
 */
export const discordUsernameSchema = z
  .string()
  .trim()
  .min(1, "Discord username is required")
  .transform((s) => s.replace(/^@+/, ""))
  .pipe(z.string().regex(/^[A-Za-z0-9._]{2,32}(#\d{4})?$/, "Enter your Discord username (letters, numbers, dots and underscores)"));

export const aboutSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  birthday: z.string().refine(isPlausibleBirthday, "Enter a valid birthday"),
  gender: z.enum(GENDERS, { error: "Select your gender" }),
  country: z.string().refine((c) => countryNames.has(c), "Select your country"),
  phoneCountryCode: z.string().refine((c) => DIAL_CODES.includes(c), "Select a country code"),
  phoneNumber: z
    .string()
    .transform((s) => s.replace(/[\s()-]/g, ""))
    .pipe(z.string().regex(/^\d{4,15}$/, "Enter a valid phone number (digits only)")),
  discordUsername: discordUsernameSchema,
  termsAccepted: z.literal(true, { error: "You must accept the terms and conditions" }),
});

export const socialSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z
    .string()
    .trim()
    .transform((s) => s.replace(/^@+/, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9._-]{1,50}$/, "Usernames can only use letters, numbers, dots, dashes and underscores")),
  language: z.enum(LANGUAGES, { error: "Select a language for each account" }),
});

export const creatorProfileSchema = aboutSchema.extend({
  creatorType: z.enum(CREATOR_TYPES, { error: "Choose the type of creator you are" }),
  socials: z.array(socialSchema).min(1, "Add at least one social media account").max(MAX_SOCIALS),
  showcaseUrls: z
    .array(z.string().trim().refine(isShowcaseUrl, "Use a TikTok, Instagram, YouTube, Snapchat, Facebook or X link"))
    .max(MAX_SHOWCASE_URLS),
});

export type CreatorProfileInput = z.input<typeof creatorProfileSchema>;

/** Whole years between a YYYY-MM-DD birthday and now (UTC), for the review card. */
export function ageFromBirthday(birthday: string, now = new Date()): number {
  const [y, m, d] = birthday.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}
