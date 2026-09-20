import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: gold-gradient coin + bold "Monetize". */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="Monetize home">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-gradient text-sm font-black text-black shadow-[0_0_18px_rgba(240,197,114,0.25)]">
        M
      </span>
      <span className="text-lg font-extrabold tracking-tight">Monetize</span>
    </Link>
  );
}
