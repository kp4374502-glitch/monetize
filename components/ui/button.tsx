import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "outline" | "subtle" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition " +
  "hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light/60 " +
  "disabled:pointer-events-none disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  // fully rounded pill filled with the gold gradient on primary actions
  primary: "bg-gold-gradient text-black",
  outline: "border border-gold-border text-gold-light hover:bg-gold-light/10",
  // neutral pill for header controls (dropdown triggers)
  subtle: "border border-subtle text-text-primary hover:border-gold-border/60",
  ghost: "text-text-secondary hover:bg-white/5 hover:text-text-primary",
  danger: "border border-red-500/60 text-red-400 hover:bg-red-500/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2 text-sm",
  lg: "px-7 py-3 text-base",
  icon: "h-8 w-8 p-0",
};

/** Class string for anything that must look like a Button (e.g. a next/link). */
export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };

/** The one Button. Every button in the app comes from here. */
export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return <button ref={ref} className={buttonVariants({ variant, size, className })} {...props} />;
});
