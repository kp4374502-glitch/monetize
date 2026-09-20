"use client";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { submitBrandRequestAction } from "@/app/brand-request/actions";

export function BrandRequestForm() {
  return (
    <Card>
      <ActionForm action={submitBrandRequestAction} className="grid gap-4">
        <Field label="Brand name"><Input name="brandName" required maxLength={100} /></Field>
        <Field label="Discord handle" hint="How the platform team will reach you.">
          <Input name="discord" required maxLength={100} placeholder="yourname or yourname#1234" />
        </Field>
        <Field label="Anything we should know? (optional)">
          <textarea
            name="note"
            rows={4}
            maxLength={1000}
            placeholder="What you'd like to run, expected budget, timeline…"
            className="w-full rounded-xl border border-subtle bg-bg-secondary px-3.5 py-2 text-sm placeholder:text-text-secondary/70 focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold-light/20"
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" size="lg">Submit request</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
