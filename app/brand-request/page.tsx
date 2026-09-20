import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { GATE_COOKIE, verifyGateToken } from "@/lib/brand/gate";
import { getBrandRequestForUser } from "@/lib/brand/service";
import { BrandRequestForm } from "@/components/brand-request-form";
import { BrandRequestStatus } from "@/components/brand-request-status";
import { SectionHeader } from "@/components/ui/card";

/** Signed-in step 2 of Brand sign-up: describe the brand (or see the status of an existing request). */
export default async function BrandRequestPage() {
  const userId = await requireUserId();
  const existing = await getBrandRequestForUser(userId);

  if (!existing && !verifyGateToken(process.env.BRAND_SIGNUP_CODE, (await cookies()).get(GATE_COOKIE)?.value)) {
    redirect("/brand-signup"); // no request yet and no proof they knew the code
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10 sm:px-6">
      <SectionHeader
        title={existing ? "Your brand request" : "Tell us about your brand"}
        description={existing ? undefined : "This files a request. The platform team reviews every brand before anything goes live."}
      />
      {existing ? <BrandRequestStatus request={existing} /> : <BrandRequestForm />}
    </main>
  );
}
