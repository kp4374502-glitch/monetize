import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-md border border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-gold-border focus:outline-none",
          className,
        )}
        {...props}
      />
    );
  },
);
