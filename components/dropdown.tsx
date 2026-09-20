"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Header dropdown: click to toggle, closes on outside click / Escape. `testId` goes on the wrapper. */
export function Dropdown({
  trigger,
  children,
  testId,
  label,
  panelClassName,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  label: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" data-testid={testId}>
      <Button
        type="button"
        variant={open ? "outline" : "subtle"}
        size="sm"
        className="text-sm font-medium"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </Button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gold-border/30 bg-bg-secondary p-1.5 shadow-2xl shadow-black/60",
            panelClassName,
          )}
          onClick={(e) => {
            // navigating from a menu item should close the menu
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
