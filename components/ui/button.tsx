import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "danger" };

export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50",
        variant === "primary" && "bg-gold-light text-black",
        variant === "outline" && "border border-gold-border text-text-primary",
        variant === "danger" && "border border-red-500 text-red-400",
        className,
      )}
      {...props}
    />
  );
});
