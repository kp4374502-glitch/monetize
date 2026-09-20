"use client";

import { KeyRound } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { verifyBrandCodeAction } from "@/app/brand-signup/actions";

/** Step 1 of Brand sign-up: the shared access code. */
export function BrandCodeForm() {
  return (
    <Card className="w-full" innerClassName="p-6">
      <ActionForm action={verifyBrandCodeAction} className="grid gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="flex items-center gap-2 font-medium text-text-secondary">
            <KeyRound className="h-4 w-4" aria-hidden /> Access code
          </span>
          <Input name="code" type="password" autoComplete="off" placeholder="Enter your brand access code" required autoFocus />
        </label>
        <Button type="submit" size="lg">Continue</Button>
      </ActionForm>
    </Card>
  );
}
