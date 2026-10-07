"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, Check, ImagePlus, Link2, Plus, ScanFace, Smile, X } from "lucide-react";
import { completeOnboardingAction, recordDiscordJoinAction, saveCreatorProfileAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { COUNTRIES, DIAL_CODES } from "@/lib/creators/countries";
import { DISCORD_INVITE_URL } from "@/lib/creators/flow";
import {
  aboutSchema,
  ageFromBirthday,
  CREATOR_TYPES,
  GENDER_LABELS,
  GENDERS,
  isShowcaseUrl,
  LANGUAGES,
  MAX_SHOWCASE_URLS,
  MAX_SOCIALS,
  SOCIAL_LABELS,
  SOCIAL_PLATFORMS,
  socialSchema,
} from "@/lib/creators/schemas";

type Social = { platform: string; handle: string; language: string };

export type OnboardingInitial = {
  firstName: string;
  lastName: string;
  birthday: string;
  gender: string;
  country: string;
  phoneCountryCode: string;
  phoneNumber: string;
  creatorType: string;
  socials: Social[];
  showcaseUrls: string[];
  /** A saved profile exists already (e.g. they left on the Discord step): resume there. */
  profileSaved: boolean;
  /** Join Community was already clicked on an earlier visit. */
  discordJoinClicked: boolean;
};

const STEPS = ["about", "type", "socials", "showcase", "photo", "review", "discord"] as const;
type Step = (typeof STEPS)[number];

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const blankSocial = (): Social => ({ platform: "tiktok", handle: "", language: "" });

const TYPE_COPY: Record<(typeof CREATOR_TYPES)[number], { title: string; body: string; icon: typeof ScanFace }> = {
  faceless: {
    title: "Faceless Creator",
    body: "You create content without showing your face. This includes clipping, AI content, meme posts, slideshows and more.",
    icon: ScanFace,
  },
  face: {
    title: "Face Creator",
    body: "You show your face in your content. This includes influencers and personalities.",
    icon: Smile,
  },
};

function DiscordGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.86-.6 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
    </div>
  );
}

function Progress({ index }: { index: number }) {
  return (
    <div className="mt-5 flex justify-center gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <span
          key={s}
          className={cn("h-1.5 rounded-full transition-all", i === index ? "w-8 bg-gold-gradient" : "w-1.5 bg-white/20")}
        />
      ))}
    </div>
  );
}

export function OnboardingWizard({ initial, next }: { initial: OnboardingInitial; next?: string }) {
  const { user } = useUser();
  const [step, setStep] = React.useState<Step>(initial.profileSaved ? "discord" : "about");
  const [about, setAbout] = React.useState({
    firstName: initial.firstName,
    lastName: initial.lastName,
    birthday: initial.birthday,
    gender: initial.gender,
    country: initial.country,
    phoneCountryCode: initial.phoneCountryCode,
    phoneNumber: initial.phoneNumber,
    termsAccepted: initial.profileSaved,
  });
  const [creatorType, setCreatorType] = React.useState(initial.creatorType);
  const [socials, setSocials] = React.useState<Social[]>(
    initial.socials.length ? [...initial.socials, ...(initial.socials.length < MAX_SOCIALS ? [blankSocial()] : [])] : [blankSocial()],
  );
  const [showcase, setShowcase] = React.useState<string[]>(
    Array.from({ length: MAX_SHOWCASE_URLS }, (_, i) => initial.showcaseUrls[i] ?? ""),
  );
  const [error, setError] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [joinClicked, setJoinClicked] = React.useState(initial.discordJoinClicked);
  const [pending, startTransition] = React.useTransition();

  const index = STEPS.indexOf(step);
  const filledSocials = socials.filter((s) => s.handle.trim() !== "");
  const filledShowcase = showcase.map((u) => u.trim()).filter(Boolean);

  // Per-step "can press Next" checks, mirroring the server-side zod rules in lib/creators/schemas.ts.
  const aboutCheck = aboutSchema.safeParse(about);
  const socialsCheck = filledSocials.length > 0 && filledSocials.every((s) => socialSchema.safeParse(s).success);
  const showcaseCheck = filledShowcase.every(isShowcaseUrl);
  const canContinue: Record<Step, boolean> = {
    about: aboutCheck.success,
    type: (CREATOR_TYPES as readonly string[]).includes(creatorType),
    socials: socialsCheck,
    showcase: showcaseCheck,
    photo: Boolean(user?.hasImage),
    review: true,
    discord: true,
  };

  function go(to: Step) {
    setError("");
    setStep(to);
    window.scrollTo({ top: 0 });
  }

  function nextStep() {
    if (!canContinue[step]) {
      if (step === "about" && !aboutCheck.success) setError(aboutCheck.error.issues[0]?.message ?? "Fill in every field.");
      else if (step === "socials") setError("Add at least one account, with a valid username and a language for each.");
      else if (step === "showcase") setError("Use TikTok, Instagram, YouTube, Snapchat, Facebook or X links.");
      return;
    }
    go(STEPS[index + 1]);
  }

  function updateSocial(i: number, patch: Partial<Social>) {
    setSocials((rows) => {
      const updated = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
      // Like the reference flow: a fresh empty row appears once the last one has a username.
      const last = updated[updated.length - 1];
      if (last.handle.trim() && updated.length < MAX_SOCIALS) updated.push(blankSocial());
      return updated;
    });
  }

  function removeSocial(i: number) {
    setSocials((rows) => {
      const left = rows.filter((_, j) => j !== i);
      return left.length ? left : [blankSocial()];
    });
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || !user) return;
    setError("");
    if (!file.type.startsWith("image/")) return setError("Choose an image file (JPG, PNG or WebP).");
    if (file.size > MAX_IMAGE_BYTES) return setError("That image is over 10 MB. Choose a smaller one.");
    setUploading(true);
    try {
      // Stored by Clerk as the account's profile picture, so it shows everywhere the account appears.
      await user.setProfileImage({ file });
      await user.reload();
    } catch {
      setError("Upload failed. Please try a different image.");
    } finally {
      setUploading(false);
    }
  }

  function finishProfile() {
    setError("");
    startTransition(async () => {
      const res = await saveCreatorProfileAction({
        ...about,
        creatorType,
        socials: filledSocials,
        showcaseUrls: filledShowcase,
      });
      if (res.ok) go("discord");
      else setError(res.error);
    });
  }

  function joinCommunity() {
    // The link itself opens Discord in a new tab; this records the click so Next unlocks.
    setJoinClicked(true);
    startTransition(async () => {
      const res = await recordDiscordJoinAction();
      if (!res.ok) {
        setJoinClicked(false);
        setError(res.error);
      }
    });
  }

  function finishOnboarding() {
    if (!joinClicked) {
      setError("Joining our Discord community is required. Click Join Community, join the server, then press Next.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await completeOnboardingAction(next);
      // On success the action redirects; we only get here on failure.
      if (res && !res.ok) setError(res.error);
    });
  }

  const backButton = (to: Step) => (
    <Button type="button" variant="subtle" size="lg" className="flex-1" onClick={() => go(to)} disabled={pending}>
      Back
    </Button>
  );

  const nextButton = (
    <Button type="button" size="lg" className="flex-[2]" onClick={nextStep} disabled={pending}>
      Next step <ArrowRight className="h-4 w-4" />
    </Button>
  );

  return (
    <Card className="w-full" innerClassName="p-6 sm:p-8">
      <div data-testid={`onboarding-step-${step}`} className="min-h-[24rem]">
        {step === "about" && (
          <>
            <StepHeader title="Tell us about you" subtitle="Let's start with the essentials." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">
                <Input autoComplete="given-name" placeholder="John" value={about.firstName} onChange={(e) => setAbout({ ...about, firstName: e.target.value })} />
              </Field>
              <Field label="Last name">
                <Input autoComplete="family-name" placeholder="Doe" value={about.lastName} onChange={(e) => setAbout({ ...about, lastName: e.target.value })} />
              </Field>
              <Field label="Birthday">
                <Input type="date" autoComplete="bday" value={about.birthday} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setAbout({ ...about, birthday: e.target.value })} />
              </Field>
              <Field label="Gender">
                <Select value={about.gender} onChange={(e) => setAbout({ ...about, gender: e.target.value })}>
                  <option value="" disabled>Select gender</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{GENDER_LABELS[g]}</option>)}
                </Select>
              </Field>
              <Field label="Country" className="sm:col-span-2">
                <Select
                  value={about.country}
                  onChange={(e) => {
                    const country = e.target.value;
                    const dial = COUNTRIES.find((c) => c.name === country)?.dial;
                    // Pre-fill the phone code from the country unless they already picked one.
                    setAbout({ ...about, country, phoneCountryCode: about.phoneCountryCode || dial || "" });
                  }}
                >
                  <option value="" disabled>Select your country</option>
                  {COUNTRIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </Select>
              </Field>
              <div className="grid gap-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-text-secondary">Phone number</span>
                <div className="flex gap-2">
                  <Select aria-label="Country code" className="w-28" value={about.phoneCountryCode} onChange={(e) => setAbout({ ...about, phoneCountryCode: e.target.value })}>
                    <option value="" disabled>Code</option>
                    {DIAL_CODES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                  <Input type="tel" autoComplete="tel-national" aria-label="Phone number" placeholder="Phone number" value={about.phoneNumber} onChange={(e) => setAbout({ ...about, phoneNumber: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-text-secondary sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#f0c572]"
                  checked={about.termsAccepted}
                  onChange={(e) => setAbout({ ...about, termsAccepted: e.target.checked })}
                />
                I accept the terms and conditions
              </label>
            </div>
          </>
        )}

        {step === "type" && (
          <>
            <StepHeader title="What type of creator are you?" subtitle="This helps us match you with the right campaigns." />
            <div className="grid gap-3" role="radiogroup">
              {CREATOR_TYPES.map((t) => {
                const { title, body, icon: Icon } = TYPE_COPY[t];
                const selected = creatorType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCreatorType(t)}
                    className={cn(
                      "flex items-center gap-4 rounded-2xl border p-4 text-left transition",
                      selected ? "border-gold-border bg-gold-light/10" : "border-subtle hover:border-gold-border/50",
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-gold-light">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{title}</span>
                      <span className="mt-0.5 block text-sm text-text-secondary">{body}</span>
                    </span>
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                        selected ? "border-transparent bg-gold-gradient text-black" : "border-subtle",
                      )}
                    >
                      {selected && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "socials" && (
          <>
            <StepHeader title="Link your social media accounts" subtitle="Add the accounts you'll post from, to showcase your reach." />
            <div className="grid gap-3">
              {socials.map((s, i) => (
                <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <Select aria-label="Platform" className="w-36" value={s.platform} onChange={(e) => updateSocial(i, { platform: e.target.value })}>
                    {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{SOCIAL_LABELS[p]}</option>)}
                  </Select>
                  <Input aria-label="Username" placeholder="@username" className="min-w-0 flex-1" value={s.handle} onChange={(e) => updateSocial(i, { handle: e.target.value })} />
                  <Select aria-label="Language" className="w-36" value={s.language} onChange={(e) => updateSocial(i, { language: e.target.value })}>
                    <option value="" disabled>Language</option>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="h-[38px] w-[38px]" aria-label="Remove account" onClick={() => removeSocial(i)} disabled={!s.handle && socials.length === 1}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {step === "showcase" && (
          <>
            <StepHeader title="Showcase your best work" subtitle="Add up to 3 video links from TikTok, Instagram, YouTube, Snapchat, Facebook or X. Optional." />
            <div className="grid gap-3">
              {showcase.map((url, i) => (
                <div key={i} className="relative">
                  <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden />
                  <Input
                    type="url"
                    aria-label={`Video link ${i + 1}`}
                    placeholder="https://"
                    className={cn("pl-10", url.trim() && !isShowcaseUrl(url.trim()) && "border-red-500/60")}
                    value={url}
                    onChange={(e) => setShowcase((rows) => rows.map((r, j) => (j === i ? e.target.value : r)))}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {step === "photo" && (
          <>
            <StepHeader title="Upload your profile picture" subtitle="Add a clear photo that represents you." />
            <label
              className={cn(
                "mx-auto flex aspect-square w-full max-w-[17rem] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed text-center transition",
                user?.hasImage ? "border-gold-border/60" : "border-subtle hover:border-gold-border/60",
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                uploadPhoto(e.dataTransfer.files?.[0]);
              }}
            >
              {user?.hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted avatar URL
                <img src={user.imageUrl} alt="Your profile picture" className="h-full w-full object-cover" />
              ) : (
                <span className="px-6">
                  <ImagePlus className="mx-auto mb-3 h-7 w-7 text-gold-light" />
                  <span className="block font-semibold">{uploading ? "Uploading…" : "Drop image here"}</span>
                  <span className="mt-1 block text-xs text-text-secondary">Click to browse, or drag & drop a file here</span>
                </span>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => uploadPhoto(e.target.files?.[0])} disabled={uploading} />
            </label>
            {user?.hasImage && <p className="mt-3 text-center text-xs text-text-secondary">Click the photo to change it.</p>}
          </>
        )}

        {step === "review" && (
          <>
            <div className="mb-5 flex items-center gap-4">
              {user?.hasImage && (
                // eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted avatar URL
                <img src={user.imageUrl} alt="" className="h-16 w-16 rounded-full border border-gold-border/50 object-cover" />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-extrabold tracking-tight">{about.firstName} {about.lastName}</h1>
                <p className="text-sm text-text-secondary">
                  {ageFromBirthday(about.birthday)} · {GENDER_LABELS[about.gender as keyof typeof GENDER_LABELS]} · {about.country}
                </p>
              </div>
            </div>
            <div className="mb-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-gold-border/60 bg-gold-light/10 px-3 py-1 text-xs font-semibold text-gold-light">
                {TYPE_COPY[creatorType as keyof typeof TYPE_COPY]?.title}
              </span>
              {filledSocials.map((s, i) => (
                <span key={i} className="rounded-full border border-subtle px-3 py-1 text-xs font-semibold">
                  {SOCIAL_LABELS[s.platform as keyof typeof SOCIAL_LABELS]} · @{s.handle.replace(/^@+/, "")}
                </span>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: MAX_SHOWCASE_URLS }, (_, i) => filledShowcase[i]).map((url, i) =>
                url ? (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="flex min-h-28 flex-col justify-between rounded-2xl border border-subtle p-4 text-sm transition hover:border-gold-border/60">
                    <Link2 className="h-4 w-4 text-gold-light" />
                    <span className="truncate text-text-secondary">{url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                  </a>
                ) : (
                  <button key={i} type="button" onClick={() => go("showcase")} className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-subtle text-sm text-text-secondary transition hover:border-gold-border/60">
                    <Plus className="h-5 w-5" /> Add your work
                  </button>
                ),
              )}
            </div>
          </>
        )}

        {step === "discord" && (
          <div className="text-center">
            <span className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#5865F2] text-white shadow-[0_0_40px_rgba(88,101,242,0.35)]">
              <DiscordGlyph className="h-10 w-10" />
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Join the <span className="font-serif font-medium italic text-gold-light">community</span>
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              Campaign drops, payouts and support all happen in our Discord. Joining is required to finish setting up your account.
            </p>
            <div className="mx-auto mt-6 max-w-md rounded-2xl border border-gold-border/40 bg-gradient-to-br from-gold-light/15 via-transparent to-[#5865F2]/15 p-5 text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-gold-light">Monetize Creators on Discord</p>
              <ul className="mt-3 grid gap-2 text-sm">
                {["Be first to hear about new campaigns", "Get paid out — payouts are sent through Discord", "Ask the team anything, anytime"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-light" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              onClick={joinCommunity}
              className="mx-auto mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#5865F2] px-7 py-3 font-semibold text-white transition hover:brightness-110"
            >
              <DiscordGlyph className="h-5 w-5" /> {joinClicked ? "Opened Discord — join the server" : "Join Community"}
            </a>
            {joinClicked && <p className="mt-2 text-xs text-text-secondary">Joined? Press Next to continue.</p>}
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 flex gap-3">
        {step === "about" && nextButton}
        {step === "type" && <>{backButton("about")}{nextButton}</>}
        {step === "socials" && <>{backButton("type")}{nextButton}</>}
        {step === "showcase" && <>{backButton("socials")}{nextButton}</>}
        {step === "photo" && (
          <>
            {backButton("showcase")}
            <Button type="button" size="lg" className="flex-[2]" onClick={nextStep} disabled={pending || uploading || !user?.hasImage}>
              Next step <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        )}
        {step === "review" && (
          <>
            {backButton("photo")}
            <Button type="button" size="lg" className="flex-[2]" onClick={finishProfile} disabled={pending}>
              {pending ? "Saving…" : "Finish"}
            </Button>
          </>
        )}
        {step === "discord" && (
          <>
            {backButton("review")}
            <Button type="button" size="lg" className={cn("flex-[2]", !joinClicked && "opacity-60")} onClick={finishOnboarding} disabled={pending}>
              {pending ? "Finishing…" : "Next"} <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {step === "review" && (
        <p className="mt-3 text-center text-xs text-text-secondary">You can edit anything by going back.</p>
      )}
      <Progress index={index} />
    </Card>
  );
}
