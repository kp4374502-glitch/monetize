import { describe, expect, it } from "vitest";
import { browserLabel, deviceTitle, locationLabel, sortSessions } from "@/lib/auth/devices";

describe("device labels", () => {
  it("uses Clerk's device type, else a generic label that respects mobile", () => {
    expect(deviceTitle({ deviceType: "Windows" })).toBe("Windows");
    expect(deviceTitle({ isMobile: true })).toBe("Mobile device");
    expect(deviceTitle({})).toBe("Unknown device");
    expect(deviceTitle({ deviceType: "  " })).toBe("Unknown device");
  });

  it("shows the browser with just its major version, or nothing if unknown", () => {
    expect(browserLabel({ browserName: "Chrome", browserVersion: "141.0.7390.55" })).toBe("Chrome 141");
    expect(browserLabel({ browserName: "Safari" })).toBe("Safari");
    expect(browserLabel({ browserVersion: "12" })).toBeNull();
  });

  it("joins whichever location parts are known, and is null when none are", () => {
    expect(locationLabel({ city: "Lagos", country: "Nigeria", ipAddress: "102.0.0.1" })).toBe("Lagos, Nigeria · 102.0.0.1");
    expect(locationLabel({ country: "Nigeria" })).toBe("Nigeria");
    expect(locationLabel({ ipAddress: "102.0.0.1" })).toBe("102.0.0.1");
    expect(locationLabel({})).toBeNull();
  });
});

describe("sortSessions", () => {
  const s = (id: string, iso: string) => ({ id, lastActiveAt: new Date(iso) });
  const list = [s("old", "2026-10-01T00:00:00Z"), s("current", "2026-09-01T00:00:00Z"), s("new", "2026-10-04T00:00:00Z")];

  it("puts this device first, then the rest by most recently active", () => {
    expect(sortSessions(list, "current").map((x) => x.id)).toEqual(["current", "new", "old"]);
  });
  it("with no known current session, sorts purely by recency, and never mutates its input", () => {
    expect(sortSessions(list, undefined).map((x) => x.id)).toEqual(["new", "old", "current"]);
    expect(list.map((x) => x.id)).toEqual(["old", "current", "new"]);
  });
});
