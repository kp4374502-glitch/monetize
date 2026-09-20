import Link from "next/link";
import { Building2, ChevronDown, LogIn } from "lucide-react";
import { Dropdown } from "@/components/dropdown";

const item = "flex items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/5";

/**
 * The single landing-page entry point for the platform side: one button that opens a small menu with
 * the two real destinations. No separate auth flow — it only links to pages that already exist.
 * (Creators keep using the main "Sign in" button next to it.)
 */
export function OwnerBrandMenu() {
  return (
    <Dropdown
      testId="owner-brand-menu"
      label="Owner or brand access"
      variant="outline"
      size="lg"
      triggerClassName="text-base font-semibold"
      panelClassName="left-1/2 right-auto w-[22rem] -translate-x-1/2"
      trigger={
        <>
          <Building2 className="h-4 w-4" aria-hidden /> Owner / Brand sign in <ChevronDown className="h-4 w-4" aria-hidden />
        </>
      }
    >
      <Link href="/sign-in" role="menuitem" className={item}>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-black">
          <LogIn className="h-4 w-4" aria-hidden />
        </span>
        <span>
          <span className="block text-sm font-bold">Sign in</span>
          <span className="block text-xs text-text-secondary">I already have an account (Owner, Admin or Mod)</span>
        </span>
      </Link>
      <Link href="/brand-signup" role="menuitem" className={item}>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-border/60 text-gold-light">
          <Building2 className="h-4 w-4" aria-hidden />
        </span>
        <span>
          <span className="block text-sm font-bold">Brand sign-up</span>
          <span className="block text-xs text-text-secondary">I&apos;m a new brand — access code required</span>
        </span>
      </Link>
    </Dropdown>
  );
}
