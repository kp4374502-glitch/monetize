import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { isPlatformOwner } from "@/lib/auth/roles";
import { countPendingBrandRequests } from "@/lib/brand/service";
import { buttonVariants } from "@/components/ui/button";

/** Header link to the review page — rendered for the platform Owner only, with a pending count. */
export async function BrandRequestsLink() {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return null;
  }
  if (!userId) return null;

  let pending = 0;
  try {
    if (!(await isPlatformOwner(userId))) return null;
    pending = await countPendingBrandRequests();
  } catch {
    return null;
  }

  return (
    <Link href="/brand-requests" className={buttonVariants({ variant: "subtle", size: "sm", className: "text-sm font-medium" })}>
      Brand requests
      {pending > 0 && (
        <span className="rounded-full bg-gold-gradient px-1.5 text-[10px] font-bold text-black">{pending}</span>
      )}
    </Link>
  );
}
