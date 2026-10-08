import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { getCreatorRoster } from "@/lib/clips/service";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { money } from "./clip-parts";

type Roster = Awaited<ReturnType<typeof getCreatorRoster>>;

/**
 * Collapsible "Creators (N)" section: one row per creator with their clips, views, earned and owed.
 * A native <details> keeps it collapsible without client JS; it starts open for small rosters.
 */
export function CreatorRoster({
  roster,
  limit,
  campaignId,
  canViewDetails = false,
}: {
  roster: Roster;
  limit: number;
  campaignId: string;
  /** Owner/Admin only: shows the "Details" link to a creator's onboarding form. The page itself re-checks. */
  canViewDetails?: boolean;
}) {
  return (
    <section data-testid="creators-section">
      <Card innerClassName="p-0">
        <details className="group" open={roster.length <= 12}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              Creators
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-text-secondary" data-testid="creators-count">
                {roster.length}
              </span>
            </h2>
            <ChevronDown className="h-5 w-5 text-text-secondary transition group-open:rotate-180" aria-hidden />
          </summary>

          {roster.length === 0 ? (
            <p className="border-t border-subtle px-5 py-8 text-center text-sm text-text-secondary">
              No creators have joined yet. Generate an invite link below to onboard some.
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-auto border-t border-subtle">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="sticky top-0 bg-bg-secondary text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Creator</th>
                    <th className="px-3 py-2.5 text-right">Posts</th>
                    <th className="px-3 py-2.5 text-right">Total views</th>
                    <th className="px-3 py-2.5 text-right">Earned</th>
                    <th className="px-5 py-2.5 text-right">Owed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {roster.map((c) => (
                    <tr key={c.userId} data-testid="creator-row" className="hover:bg-white/[0.03]">
                      <td className="px-5 py-3 font-semibold">
                        <Link
                          href={`/campaigns/${campaignId}/history?creator=${encodeURIComponent(c.userId)}`}
                          className="inline-flex items-center gap-2 hover:underline"
                          data-testid="creator-link"
                        >
                          {c.username}
                          {c.suspended && <Badge status="paused">suspended</Badge>}
                        </Link>
                        {canViewDetails && (
                          <Link
                            href={`/campaigns/${campaignId}/creators/${encodeURIComponent(c.userId)}`}
                            className="ml-3 text-xs font-medium text-text-secondary underline-offset-2 hover:text-gold-light hover:underline"
                            data-testid="creator-details-link"
                          >
                            Details
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.clips.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.views.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-gold-light">{money(c.earned)}</td>
                      <td className={`px-5 py-3 text-right tabular-nums ${Number(c.owed) > 0 ? "font-semibold text-amber-300" : "text-text-secondary"}`}>
                        {money(c.owed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {roster.length >= limit && (
                <p className="border-t border-subtle px-5 py-2.5 text-xs text-text-secondary">
                  Showing the top {limit} creators by earnings.
                </p>
              )}
            </div>
          )}
        </details>
      </Card>
    </section>
  );
}
