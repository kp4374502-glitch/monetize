import * as React from "react";
import { cn } from "@/lib/utils";

/** One color map for every status/role the app shows. Unknown values fall back to neutral. */
const tones: Record<string, string> = {
  // clip lifecycle
  awaiting_analytics: "border-sky-400/50 bg-sky-400/10 text-sky-300",
  pending: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  approved: "border-green-500/50 bg-green-500/10 text-green-400",
  rejected: "border-red-500/50 bg-red-500/10 text-red-400",
  paid: "border-gold-border/60 bg-gold-light/15 text-gold-light",
  // campaign lifecycle
  active: "border-green-500/50 bg-green-500/10 text-green-400",
  paused: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  closed: "border-zinc-500/50 bg-zinc-500/10 text-zinc-300",
  archived: "border-zinc-600/50 bg-zinc-600/10 text-zinc-400",
  // roles
  owner: "border-gold-border/60 bg-gold-light/15 text-gold-light",
  admin: "border-purple-400/50 bg-purple-400/10 text-purple-300",
  mod: "border-sky-400/50 bg-sky-400/10 text-sky-300",
  creator: "border-zinc-500/50 bg-zinc-500/10 text-zinc-300",
};

export function Badge({
  status,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        tones[status] ?? "border-subtle bg-white/5 text-text-secondary",
        className,
      )}
      {...props}
    >
      {children ?? status}
    </span>
  );
}
