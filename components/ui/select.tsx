import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native <select> in the brand style (keeps mobile pickers and form submission simple). */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <span className="relative block">
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none rounded-xl border border-subtle bg-bg-secondary px-3.5 py-2 pr-9 text-sm text-text-primary " +
              "transition focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold-light/20 disabled:opacity-40",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden />
      </span>
    );
  },
);
