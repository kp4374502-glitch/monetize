import { describe, expect, it } from "vitest";
import {
  aboutSchema,
  ageFromBirthday,
  creatorProfileSchema,
  discordUsernameSchema,
  isShowcaseUrl,
  socialSchema,
} from "@/lib/creators/schemas";
import { isOnboardingPending } from "@/lib/creators/flow";

const about = {
  firstName: "John",
  lastName: "Doe",
  birthday: "2004-11-07",
  gender: "male",
  country: "India",
  phoneCountryCode: "+91",
  phoneNumber: "98765 43210",
  discordUsername: "johndoe",
  termsAccepted: true,
};

describe("discordUsernameSchema", () => {
  it("accepts normal handles, drops a leading @, trims, and keeps the legacy #1234 form", () => {
    expect(discordUsernameSchema.parse("johndoe")).toBe("johndoe");
    expect(discordUsernameSchema.parse("  @john.doe_99  ")).toBe("john.doe_99");
    expect(discordUsernameSchema.parse("@@ab")).toBe("ab");
    expect(discordUsernameSchema.parse("OldName#1234")).toBe("OldName#1234");
  });

  it("rejects empty, too short, too long, and anything with spaces or other symbols", () => {
    for (const bad of ["", "   ", "@", "a", "x".repeat(33), "john doe", "john-doe", "john!", "name#12", "name#12345", "#1234"]) {
      expect(discordUsernameSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(discordUsernameSchema.safeParse("x".repeat(32)).success).toBe(true);
  });
});

describe("aboutSchema", () => {
  it("accepts a complete form and strips spaces from the phone number", () => {
    const parsed = aboutSchema.parse(about);
    expect(parsed.phoneNumber).toBe("9876543210");
  });

  it("requires a Discord username, and normalises it", () => {
    expect(aboutSchema.safeParse({ ...about, discordUsername: "" }).success).toBe(false);
    const { discordUsername: _omit, ...withoutDiscord } = about;
    expect(aboutSchema.safeParse(withoutDiscord).success).toBe(false);
    expect(aboutSchema.parse({ ...about, discordUsername: "@JohnDoe" }).discordUsername).toBe("JohnDoe");
  });

  it("requires the terms to be accepted", () => {
    expect(aboutSchema.safeParse({ ...about, termsAccepted: false }).success).toBe(false);
  });

  it("rejects impossible, future and pre-1900 birthdays", () => {
    for (const birthday of ["2004-02-30", "2999-01-01", "1899-12-31", "07/11/2004", ""]) {
      expect(aboutSchema.safeParse({ ...about, birthday }).success, birthday).toBe(false);
    }
  });

  it("only accepts countries and dialling codes from the picker lists", () => {
    expect(aboutSchema.safeParse({ ...about, country: "Atlantis" }).success).toBe(false);
    expect(aboutSchema.safeParse({ ...about, phoneCountryCode: "+999" }).success).toBe(false);
  });

  it("rejects phone numbers with letters or the wrong length", () => {
    for (const phoneNumber of ["12ab567", "123", "1234567890123456"]) {
      expect(aboutSchema.safeParse({ ...about, phoneNumber }).success, phoneNumber).toBe(false);
    }
  });
});

describe("socialSchema", () => {
  it("drops a leading @ from the username", () => {
    expect(socialSchema.parse({ platform: "tiktok", handle: "@@glowlarp", language: "English" }).handle).toBe("glowlarp");
  });

  it("requires a language and a known platform", () => {
    expect(socialSchema.safeParse({ platform: "tiktok", handle: "a", language: "" }).success).toBe(false);
    expect(socialSchema.safeParse({ platform: "myspace", handle: "a", language: "English" }).success).toBe(false);
  });

  it("rejects usernames with spaces or symbols", () => {
    expect(socialSchema.safeParse({ platform: "x", handle: "bad name", language: "English" }).success).toBe(false);
    expect(socialSchema.safeParse({ platform: "x", handle: "<script>", language: "English" }).success).toBe(false);
  });
});

describe("isShowcaseUrl", () => {
  it("accepts links on the listed platforms, including subdomains", () => {
    for (const u of [
      "https://www.tiktok.com/@a/video/1",
      "https://vm.tiktok.com/abc",
      "https://youtu.be/xyz",
      "https://x.com/a/status/1",
      "https://www.instagram.com/reel/abc",
    ]) {
      expect(isShowcaseUrl(u), u).toBe(true);
    }
  });

  it("rejects other hosts, look-alike hosts and non-http schemes", () => {
    for (const u of ["https://example.com/v", "https://nottiktok.com/v", "https://tiktok.com.evil.io/v", "javascript:alert(1)", "tiktok.com/v"]) {
      expect(isShowcaseUrl(u), u).toBe(false);
    }
  });
});

describe("creatorProfileSchema", () => {
  const full = {
    ...about,
    creatorType: "faceless",
    socials: [{ platform: "tiktok", handle: "glowlarp", language: "English" }],
    showcaseUrls: [],
  };

  it("needs at least one social account and allows no showcase links", () => {
    expect(creatorProfileSchema.safeParse(full).success).toBe(true);
    expect(creatorProfileSchema.safeParse({ ...full, socials: [] }).success).toBe(false);
  });

  it("allows at most 3 showcase links", () => {
    const link = "https://youtu.be/a";
    expect(creatorProfileSchema.safeParse({ ...full, showcaseUrls: [link, link, link] }).success).toBe(true);
    expect(creatorProfileSchema.safeParse({ ...full, showcaseUrls: [link, link, link, link] }).success).toBe(false);
  });

  it("only knows the two creator types", () => {
    expect(creatorProfileSchema.safeParse({ ...full, creatorType: "face" }).success).toBe(true);
    expect(creatorProfileSchema.safeParse({ ...full, creatorType: "vtuber" }).success).toBe(false);
  });
});

describe("ageFromBirthday", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("counts whole years and only ticks over on the birthday", () => {
    expect(ageFromBirthday("2004-11-07", now)).toBe(21);
    expect(ageFromBirthday("2004-10-07", now)).toBe(22);
    expect(ageFromBirthday("2004-10-08", now)).toBe(21);
  });
});

describe("isOnboardingPending", () => {
  it("only applies to accounts made by the self-serve creator sign-up", () => {
    expect(isOnboardingPending(undefined, null)).toBe(false);
    expect(isOnboardingPending({}, null)).toBe(false);
    expect(isOnboardingPending({ signupFlow: "brand" }, null)).toBe(false);
  });

  it("is pending until onboarding is completed", () => {
    const meta = { signupFlow: "creator" };
    expect(isOnboardingPending(meta, null)).toBe(true);
    expect(isOnboardingPending(meta, { onboardingCompletedAt: null })).toBe(true);
    expect(isOnboardingPending(meta, { onboardingCompletedAt: new Date() })).toBe(false);
  });
});
