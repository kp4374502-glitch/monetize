import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one Card: black fill with a thin gold-gradient border (docs/PRODUCT_SPEC.md -> Design system).
 * The gradient is a 1px wrapper so the border stays crisp with rounded corners.
 */
export function Card({
  className,
  innerClassName,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { innerClassName?: string }) {
  return (
    <div className={cn("rounded-2xl bg-gradient-to-br from-gold-light/50 via-gold-border/25 to-gold-dark/40 p-px", className)} {...props}>
      <div className={cn("h-full rounded-[15px] bg-bg-secondary p-5", innerClassName)}>{children}</div>
    </div>
  );
}

/** Section title row for a Card (or a bare section): heading, optional count pill and description. */
export function SectionHeader({
  title,
  count,
  description,
  action,
  className,
}: {
  title: string;
  count?: number;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-text-secondary">{count}</span>
          )}
        </h2>
        {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Stat card in the "CLIPS / TOTAL VIEWS / EARNED" style: small caps label over a big number. */
export function StatCard({
  label,
  value,
  hint,
  valueTestId,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  valueTestId?: string;
  emphasis?: boolean;
}) {
  return (
    <Card innerClassName="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-3xl font-extrabold tracking-tight",
          emphasis && "bg-gold-gradient bg-clip-text text-transparent",
        )}
        data-testid={valueTestId}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
    </Card>
  );
}

/** Amber warning treatment (e.g. missing analytics proof, duplicate flags). */
export function Callout({
  children,
  tone = "warning",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "warning" | "danger" | "info" }) {
  const tones = {
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    danger: "border-red-500/40 bg-red-500/10 text-red-300",
    info: "border-gold-border/40 bg-gold-light/10 text-gold-light",
  };
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", tones[tone], className)} {...props}>
      {children}
    </div>
  );
}
