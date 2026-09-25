"use client";

import type { ComponentProps } from "react";
import { Select } from "@/components/ui/select";

/**
 * Submits its enclosing <form> the moment the selection changes, so a status filter applies
 * immediately rather than requiring a separate "Filter" click — the missing auto-apply was why
 * changing the dropdown looked like it did nothing until Filter was also pressed.
 */
export function AutoSubmitSelect(props: ComponentProps<typeof Select>) {
  return (
    <Select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
