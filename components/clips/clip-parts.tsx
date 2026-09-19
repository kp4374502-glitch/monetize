import { clips } from "@/drizzle/schema";

export type ClipRow = typeof clips.$inferSelect;

const STALE_AFTER_MS = 36 * 60 * 60 * 1000; // cron runs daily; anything older missed a refresh

export const money = (v: string | number | null) => (v === null ? "—" : `$${Number(v).toFixed(2)}`);

export function StatusBadge({ clip }: { clip: ClipRow }) {
  const label = clip.paidStatus === "paid" ? "paid" : clip.status;
  const tone =
    label === "paid" || label === "approved"
      ? "border-green-500 text-green-400"
      : label === "rejected"
        ? "border-red-500 text-red-400"
        : "border-gold-border text-gold-light";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`} data-testid="clip-status">
      {label}
    </span>
  );
}

export function Thumb({ clip }: { clip: ClipRow }) {
  return clip.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={clip.thumbnailUrl} alt="" className="h-16 w-12 rounded object-cover" referrerPolicy="no-referrer" />
  ) : (
    <div className="flex h-16 w-12 items-center justify-center rounded bg-bg-secondary text-xs text-text-secondary">
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
      {clip.views.toLocaleString()} views · {clip.likes.toLocaleString()} likes
      {stale && <span className="ml-2 text-xs text-gold-light">({stale})</span>}
    </span>
  );
}
