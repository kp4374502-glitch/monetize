import Link from "next/link";
import { GENDER_LABELS, SOCIAL_LABELS, ageFromBirthday } from "@/lib/creators/schemas";
import type { getCreatorDetailsForAdmin } from "@/lib/creators/service";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout, Card, SectionHeader } from "@/components/ui/card";

type Details = NonNullable<Awaited<ReturnType<typeof getCreatorDetailsForAdmin>>>;

const TYPE_LABELS: Record<string, string> = { faceless: "Faceless creator", face: "Face creator" };
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function Row({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-text-secondary">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-semibold" data-testid={testId}>
        {value ?? <span className="font-normal text-text-secondary">—</span>}
      </dd>
    </div>
  );
}

/** One creator's onboarding form details (Owner/Admin only: the page that renders this does the access check). */
export function CreatorDetailsView({
  campaign,
  campaignId,
  d,
}: {
  campaign: { name: string; brandName: string };
  campaignId: string;
  d: Details;
}) {
  const id = campaignId;
  const p = d.profile;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gold-light">{campaign.brandName}</p>
          <h1 className="text-3xl font-extrabold tracking-tight" data-testid="creator-details-name">
            {d.username}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            {campaign.name}
            {d.suspended && <Badge status="paused">suspended</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/campaigns/${id}/history?creator=${encodeURIComponent(d.userId)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Their dashboard
          </Link>
          <Link href={`/campaigns/${id}`} className={buttonVariants({ variant: "subtle", size: "sm" })}>
            Back to campaign
          </Link>
        </div>
      </div>

      <Card innerClassName="space-y-3">
        <SectionHeader title="Accounts" className="mb-1" />
        <dl className="space-y-3">
          <Row label="Username" value={d.username} testId="detail-username" />
          <Row label="Discord username" value={p?.discordUsername ? `@${p.discordUsername}` : null} testId="detail-discord" />
        </dl>
      </Card>

      {!p ? (
        <Callout tone="info" data-testid="no-form-on-file">
          <span>No onboarding form on file. This creator joined by invite link before self-serve sign-up existed.</span>
        </Callout>
      ) : (
        <>
          <Card innerClassName="space-y-3">
            <SectionHeader title="About" className="mb-1" />
            <dl className="space-y-3">
              <Row label="Name" value={`${p.firstName} ${p.lastName}`} />
              <Row label="Birthday" value={`${p.birthday} (${ageFromBirthday(p.birthday)})`} />
              <Row label="Gender" value={GENDER_LABELS[p.gender as keyof typeof GENDER_LABELS] ?? p.gender} />
              <Row label="Country" value={p.country} />
              <Row label="Phone" value={`${p.phoneCountryCode} ${p.phoneNumber}`} />
              <Row label="Creator type" value={TYPE_LABELS[p.creatorType] ?? p.creatorType} />
            </dl>
          </Card>

          <Card innerClassName="space-y-3">
            <SectionHeader title="Social accounts" className="mb-1" />
            <ul className="space-y-1.5 text-sm" data-testid="detail-socials">
              {p.socials.map((s, i) => (
                <li key={i}>
                  <span className="font-semibold">{SOCIAL_LABELS[s.platform as keyof typeof SOCIAL_LABELS] ?? s.platform}</span>{" "}
                  <span>@{s.handle}</span> <span className="text-text-secondary">· {s.language}</span>
                </li>
              ))}
            </ul>
            <SectionHeader title="Showcase work" className="mb-1 mt-4" />
            {p.showcaseUrls.length === 0 ? (
              <p className="text-sm text-text-secondary">None added.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {p.showcaseUrls.map((u) => (
                  <li key={u} className="truncate">
                    <a href={u} target="_blank" rel="noopener noreferrer" className="text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card innerClassName="space-y-3">
            <SectionHeader title="Onboarding" className="mb-1" />
            <dl className="space-y-3">
              <Row label="Accepted terms" value={day(p.termsAcceptedAt)} />
              <Row label="Clicked Join Community" value={day(p.discordJoinClickedAt) ?? "No"} />
              <Row label="Onboarding completed" value={day(p.onboardingCompletedAt) ?? "Not finished"} />
              <Row label="Joined this campaign" value={day(d.joinedAt)} />
            </dl>
          </Card>
        </>
      )}
    </main>
  );
}
