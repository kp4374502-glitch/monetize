"use client";

import { ActionForm, type ActionState } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/**
 * Owner/Admin control for renaming a campaign and its brand. Only these two fields change; payout
 * settings and platforms have their own controls. The server re-validates (both required).
 */
export function DetailsForm({
  action,
  brandName,
  name,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  brandName: string;
  name: string;
}) {
  return (
    <ActionForm action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand name">
          <Input name="brandName" defaultValue={brandName} required data-testid="details-brand-name" />
        </Field>
        <Field label="Campaign name">
          <Input name="name" defaultValue={name} required data-testid="details-name" />
        </Field>
      </div>
      <Button type="submit" size="sm">Save details</Button>
    </ActionForm>
  );
}
