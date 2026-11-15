"use client";

import { ActionForm, type ActionState } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export type PayoutSettings = {
  baseRate: string;
  divisor: string;
  maxPayPerPost: string;
  viewMinimum: number;
  totalBudget: string;
  dailySubmissionLimit: number;
  budgetSpent: string;
};

// Numeric columns come back as "1.0000"; show them without the trailing zeros.
const plain = (v: string) => String(Number(v));
const usd = (v: string) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Owner/Admin control for the pay terms and limits set when the campaign was created. Pay-term changes
 * apply to posts submitted from now on (the server pins older posts to their old terms); total budget
 * and the daily limit apply immediately. The server re-validates everything.
 */
export function PayoutSettingsForm({
  action,
  current,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  current: PayoutSettings;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Base rate ($)">
          <Input name="baseRate" type="number" step="any" min="0" defaultValue={plain(current.baseRate)} required data-testid="settings-base-rate" />
        </Field>
        <Field label="Divisor">
          <Input name="divisor" type="number" step="any" min="0" defaultValue={plain(current.divisor)} required data-testid="settings-divisor" />
        </Field>
        <Field label="Max pay per post ($)">
          <Input name="maxPayPerPost" type="number" step="0.01" min="0" defaultValue={plain(current.maxPayPerPost)} required data-testid="settings-max-pay" />
        </Field>
        <Field label="View minimum">
          <Input name="viewMinimum" type="number" step="1" min="0" defaultValue={current.viewMinimum} required data-testid="settings-view-minimum" />
        </Field>
        <Field label="Total budget ($)" hint={`${usd(current.budgetSpent)} paid so far`}>
          <Input name="totalBudget" type="number" step="0.01" min="0" defaultValue={plain(current.totalBudget)} required data-testid="settings-total-budget" />
        </Field>
        <Field label="Daily submission limit" hint="Per creator, per day (UTC)">
          <Input name="dailySubmissionLimit" type="number" step="1" min="1" defaultValue={current.dailySubmissionLimit} required data-testid="settings-daily-limit" />
        </Field>
      </div>
      <p className="text-xs text-text-secondary">
        Base rate, divisor, max pay per post and view minimum apply to posts submitted from now on. Posts already
        submitted keep the terms they were submitted under. Total budget and the daily limit apply straight away.
      </p>
      <Button type="submit" size="sm">Save settings</Button>
    </ActionForm>
  );
}
