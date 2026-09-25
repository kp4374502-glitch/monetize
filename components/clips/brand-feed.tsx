import { Card, SectionHeader, StatCard } from "@/components/ui/card";
import { Stats, StatusBadge, Thumb, money, type ClipRow } from "./clip-parts";

/**
 * Brand's read-only view: every clip on the campaign, any status, no creator identity anywhere —
 * the query it's fed from (getBrandClipFeed) never joins `users`, so there's nothing to leak here.
 */
export function BrandFeed({
  rows,
  stats,
}: {
  rows: ClipRow[];
  stats: { totalClips: number; totalViews: number; approvedViews: number; paidSoFar: string };
}) {
  return (
    <section className="space-y-4">
      <SectionHeader title="Campaign clips" description="Every clip submitted to this campaign." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="brand-stats">
        <StatCard label="Clips posted" value={stats.totalClips.toLocaleString()} valueTestId="brand-total-clips" emphasis />
        <StatCard label="Total views" value={stats.totalViews.toLocaleString()} valueTestId="brand-total-views" />
        <StatCard label="Approved views" value={stats.approvedViews.toLocaleString()} valueTestId="brand-approved-views" />
        <StatCard label="Paid so far" value={money(stats.paidSoFar)} valueTestId="brand-paid-so-far" />
      </div>

      {rows.length === 0 ? (
        <Card innerClassName="py-10 text-center text-sm text-text-secondary">No clips submitted yet.</Card>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5" data-testid="brand-clip-list">
          {rows.map((c) => (
            <li key={c.id} data-testid="brand-clip-row">
              <Card innerClassName="flex flex-wrap items-center gap-4 p-4">
                <Thumb clip={c} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge clip={c} />
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-text-secondary underline-offset-2 hover:text-gold-light hover:underline"
                    >
                      {c.url}
                    </a>
                  </div>
                  <div className="mt-1">
                    <Stats clip={c} />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
