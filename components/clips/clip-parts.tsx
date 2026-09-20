import { clips } from "@/drizzle/schema";
import { Badge } from "@/components/ui/badge";

export type ClipRow = typeof clips.$inferSelect;

const STALE_AFTER_MS = 36 * 60 * 60 * 1000; // cron runs daily; anything older missed a refresh

export const money = (v: string | number | null) =>
  v === null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StatusBadge({ clip }: { clip: ClipRow }) {
  const label = clip.paidStatus === "paid" ? "paid" : clip.status;
  return <Badge status={label} data-testid="clip-status" />;
}

export function Thumb({ clip }: { clip: ClipRow }) {
  return clip.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={clip.thumbnailUrl} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover ring-1 ring-subtle" referrerPolicy="no-referrer" />
  ) : (
    <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-semibold uppercase text-text-secondary ring-1 ring-subtle">
      {clip.platform.slice(0, 2)}
    </div>
  );
}

export function Stats({ clip }: { clip: ClipRow }) {
  const stale = !clip.lastRefreshedAt
    ? "stats pending"
    : Date.now() - clip.lastRefreshedAt.getTime() > STALE_AFTER_MS
      ? "stats may be outdated"
      : null;
  return (
    <span className="text-sm text-text-secondary">
      <span className="font-semibold text-text-primary">{clip.views.toLocaleString()}</span> views ·{" "}
      <span className="font-semibold text-text-primary">{clip.likes.toLocaleString()}</span> likes
      {stale && <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">{stale}</span>}
    </span>
  );
}
