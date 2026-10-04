/** Pure helpers for the Devices tab in Manage account (see components/devices-panel.tsx). */

export interface SessionActivityLike {
  browserName?: string;
  browserVersion?: string;
  deviceType?: string;
  ipAddress?: string;
  city?: string;
  country?: string;
  isMobile?: boolean;
}

/** "Windows", "iPhone", ...; Clerk doesn't always know, so fall back to a generic label. */
export function deviceTitle(a: SessionActivityLike): string {
  return a.deviceType?.trim() || (a.isMobile ? "Mobile device" : "Unknown device");
}

/** "Chrome 141" (major version only), or null if the browser is unknown. */
export function browserLabel(a: SessionActivityLike): string | null {
  const name = a.browserName?.trim();
  if (!name) return null;
  const major = a.browserVersion?.trim().split(".")[0];
  return major ? `${name} ${major}` : name;
}

/** "Lagos, Nigeria · 102.0.0.1" -- whichever parts are known, or null if none are. */
export function locationLabel(a: SessionActivityLike): string | null {
  const place = [a.city?.trim(), a.country?.trim()].filter(Boolean).join(", ");
  return [place, a.ipAddress?.trim()].filter(Boolean).join(" · ") || null;
}

/** This device first, then the rest by most recently active. Doesn't mutate its input. */
export function sortSessions<T extends { id: string; lastActiveAt: Date }>(sessions: T[], currentId: string | null | undefined): T[] {
  return [...sessions].sort((x, y) => {
    if (x.id === currentId) return -1;
    if (y.id === currentId) return 1;
    return y.lastActiveAt.getTime() - x.lastActiveAt.getTime();
  });
}
