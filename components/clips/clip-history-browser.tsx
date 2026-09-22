import { Button } from "@/components/ui/button";
import { Card, SectionHeader, StatCard } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ClipHistoryStatusFilter } from "@/lib/clips/service";
import { Stats, StatusBadge, Thumb, money, type ClipRow } from "./clip-parts";

type Row = { clip: ClipRow; creatorUsername: string };

const STATUS_OPTIONS: { value: ClipHistoryStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending / awaiting review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "paid", label: "Paid" },
];

const submittedOn = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A filterable view over the SAME clips already used elsewhere (getReviewQueue, getClipHistory) —
 * every clip ever submitted, or (on the creator's page) just their own. GET-based filter form so the
 * whole page stays server-rendered and shareable/bookmarkable as a URL, no client state needed.
 */
export function ClipHistoryBrowser({
  basePath,
  status,
  from,
  to,
  summary,
  rows,
  showCreator,
}: {
  basePath: string;
  status: ClipHistoryStatusFilter;
  from: string;
  to: string;
  summary: { total: number; pending: number; approved: number; rejected: number; paid: number };
  rows: Row[];
  showCreator: boolean;
}) {
  const filtered = status !== "all" || !!from || !!to;
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Clip history"
        description={showCreator ? "Every clip ever submitted to this campaign." : "Your submissions to this campaign."}
      />

      <Card innerClassName="p-4">
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
          <Field label="Status" className="w-full sm:w-56">
            <Select name="status" defaultValue={status}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" name="from" defaultValue={from} className="w-40" />
          </Field>
          <Field label="To">
            <Input type="date" name="to" defaultValue={to} className="w-40" />
          </Field>
          <Button type="submit" size="sm">
            Filter
          </Button>
          {filtered && (
            <a href={basePath} className="text-sm text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
              Clear filters
            </a>
          )}
        </form>
      </Card>

      {/* The date range narrows this too, but the status tab never does — so it stays a stable overview while the list below is filtered by both. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="history-summary">
        <StatCard label="Submitted" value={summary.total.toLocaleString()} valueTestId="history-total" emphasis />
        <StatCard label="Pending" value={summary.pending.toLocaleString()} />
        <StatCard label="Approved" value={summary.approved.toLocaleString()} />
        <StatCard label="Rejected" value={summary.rejected.toLocaleString()} />
        <StatCard label="Paid" value={summary.paid.toLocaleString()} />
      </div>

      {rows.length === 0 ? (
        <Card innerClassName="py-10 text-center text-sm text-text-secondary">No clips match this filter.</Card>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5" data-testid="history-list">
          {rows.map(({ clip: c, creatorUsername }) => (
            <li key={c.id} data-testid="history-row">
              <Card innerClassName="flex flex-wrap items-center gap-4 p-4">
                <Thumb clip={c} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge clip={c} />
                    {showCreator && <span className="font-bold" data-testid="history-creator">{creatorUsername}</span>}
                    <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                      {c.url}
                    </a>
                  </div>
                  <div className="mt-1">
                    <Stats clip={c} />
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">Submitted {submittedOn(c.submittedAt)}</p>
                  {c.status === "rejected" && c.rejectionReason && (
                    <p className="mt-1 text-xs text-red-300">Rejected: {c.rejectionReason}</p>
                  )}
                </div>
                <span className="text-base font-extrabold text-gold-light" data-testid="history-payout">
                  {money(c.payout)}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
