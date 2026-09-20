import type { getClipHistory } from "@/lib/clips/service";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Thumb, money } from "./clip-parts";

type History = Awaited<ReturnType<typeof getClipHistory>>;

const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");

/** Paid and Rejected lists (newest first, up to 50 each). The money totals live in the stat cards. */
export function ClipHistory({ history }: { history: History }) {
  return (
    <>
      <section>
        <SectionHeader title="Paid" count={history.paid.length} />
        {history.paid.length === 0 && (
          <Card innerClassName="py-8 text-center text-sm text-text-secondary">Nothing paid yet.</Card>
        )}
        <ul className="grid gap-2.5">
          {history.paid.map(({ clip: c, creatorUsername, paidByUsername }) => (
            <li key={c.id} data-testid="paid-row">
              <Card innerClassName="flex items-center gap-4 p-4">
                <Thumb clip={c} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge status="paid" />
                    <span className="font-bold">{creatorUsername}</span>
                    <span className="text-text-secondary">{c.views.toLocaleString()} views</span>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    Marked paid by {paidByUsername ?? "unknown"} · {when(c.paidAt)}
                  </p>
                </div>
                <span className="text-xl font-extrabold text-gold-light" data-testid="paid-amount">{money(c.payout)}</span>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionHeader title="Rejected" count={history.rejected.length} />
        {history.rejected.length === 0 && (
          <Card innerClassName="py-8 text-center text-sm text-text-secondary">No rejected clips.</Card>
        )}
        <ul className="grid gap-2.5">
          {history.rejected.map(({ clip: c, creatorUsername, rejectedBy }) => (
            <li key={c.id} data-testid="rejected-row">
              <Card innerClassName="flex items-center gap-4 p-4">
                <Thumb clip={c} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge status="rejected" />
                    <span className="font-bold">{creatorUsername}</span>
                    <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-text-secondary underline-offset-2 hover:text-gold-light hover:underline">
                      {c.url}
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-red-300">
                    Rejected{rejectedBy ? ` by ${rejectedBy}` : ""}: {c.rejectionReason ?? "no reason recorded"}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
