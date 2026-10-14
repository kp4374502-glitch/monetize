import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { isPlatformOwner } from "@/lib/auth/roles";
import { buttonVariants } from "@/components/ui/button";

/** Header link to the Team page: rendered for the platform Owner only. */
export async function TeamLink() {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return null;
  }
  if (!userId) return null;
  try {
    if (!(await isPlatformOwner(userId))) return null;
  } catch {
    return null;
  }
  return (
    <Link href="/team" className={buttonVariants({ variant: "subtle", size: "sm", className: "text-sm font-medium" })}>
      Team
    </Link>
  );
}
