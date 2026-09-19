import type { getClipHistory } from "@/lib/clips/service";
import { Thumb, money } from "./clip-parts";

type History = Awaited<ReturnType<typeof getClipHistory>>;

const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");

/** Money totals plus the Paid and Rejected lists (newest first, up to 50 each). */
export function ClipHistory({ history }: { history: History }) {
  return (
    <section className="mt-8">
      <div className="mb-6 grid grid-cols-2 gap-3" data-testid="totals">
        <div className="rounded-md border border-subtle p-3">
          <p className="text-xs text-text-secondary">Paid so far</p>
          <p className="text-2xl font-bold" data-testid="total-paid">{money(history.totals.paid)}</p>
        </div>
        <div className="rounded-md border border-subtle p-3">
          <p className="text-xs text-text-secondary">Owed (approved, unpaid)</p>
          <p className="text-2xl font-bold" data-testid="total-owed">{money(history.totals.owed)}</p>
        </div>
      </div>

      <h2 className="mb-2 font-semibold">Paid ({history.paid.length})</h2>
      {history.paid.length === 0 && <p className="text-sm text-text-secondary">Nothing paid yet.</p>}
      <ul className="grid gap-2">
        {history.paid.map(({ clip: c, creatorUsername, paidByUsername }) => (
          <li key={c.id} className="flex items-center gap-3 rounded-md border border-subtle p-3 text-sm" data-testid="paid-row">
            <Thumb clip={c} />
            <div className="min-w-0 flex-1">
              <span className="font-medium">{creatorUsername}</span> · {c.views.toLocaleString()} views ·{" "}
              <span data-testid="paid-amount">{money(c.payout)}</span>
              <p className="text-xs text-text-secondary">
                Marked paid by {paidByUsername ?? "unknown"} · {when(c.paidAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 mt-8 font-semibold">Rejected ({history.rejected.length})</h2>
      {history.rejected.length === 0 && <p className="text-sm text-text-secondary">No rejected clips.</p>}
      <ul className="grid gap-2">
        {history.rejected.map(({ clip: c, creatorUsername, rejectedBy }) => (
          <li key={c.id} className="flex items-center gap-3 rounded-md border border-subtle p-3 text-sm" data-testid="rejected-row">
            <Thumb clip={c} />
            <div className="min-w-0 flex-1">
              <span className="font-medium">{creatorUsername}</span> ·{" "}
              <a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.url}</a>
              <p className="text-xs text-red-400">
                Rejected{rejectedBy ? ` by ${rejectedBy}` : ""}: {c.rejectionReason ?? "no reason recorded"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
