import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { GATE_TTL_SECONDS } from "@/lib/brand/gate";
import { resetBrandGateAction } from "@/app/brand-signup/actions";

/**
 * Shown on the sign-up step so it's obvious the access code was already accepted (the code box is
 * skipped while the gate cookie is valid), with a way to start over with a different code.
 */
export function BrandGateBanner() {
  const minutes = Math.round(GATE_TTL_SECONDS / 60);
  return (
    <Callout tone="info" className="w-full items-center justify-between gap-3" data-testid="brand-gate-banner">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        <span>Access code accepted (good for up to {minutes} minutes).</span>
      </span>
      <form action={resetBrandGateAction}>
        <Button type="submit" variant="ghost" size="sm">Use a different code</Button>
      </form>
    </Callout>
  );
}
