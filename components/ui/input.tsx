import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-xl border border-subtle bg-bg-secondary px-3.5 py-2 text-sm text-text-primary " +
            "placeholder:text-text-secondary/70 transition focus:border-gold-border focus:outline-none " +
            "focus:ring-2 focus:ring-gold-light/20 disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
        {...props}
      />
    );
  },
);

/** Label + control stacked. The label wraps the control, so getByLabel-style lookups keep working. */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="font-medium text-text-secondary">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-secondary/70">{hint}</span>}
    </label>
  );
}
