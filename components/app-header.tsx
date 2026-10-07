import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { AccountMenu } from "@/components/account-menu";
import { Logo } from "@/components/logo";
import { BrandRequestsLink } from "@/components/brand-requests-link";
import { CampaignSwitcher } from "@/components/campaign-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { buttonVariants } from "@/components/ui/button";

/** The one header for every page: logo, campaign switcher, notification bell, account/sign-out. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-subtle bg-bg-primary/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2.5" aria-label="Main">
          <SignedIn>
            <BrandRequestsLink />
            <Link href="/explore" className={buttonVariants({ variant: "ghost", size: "sm", className: "hidden sm:inline-flex" })}>
              Explore
            </Link>
            <CampaignSwitcher />
            <NotificationBell />
            {/* The account menu carries "Sign out", and Manage account has a Devices tab */}
            <AccountMenu />
          </SignedIn>
          <SignedOut>
            {/* Creators sign in / sign up from the homepage buttons; this one is for Owners and Admins. */}
            <Link href="/sign-in?as=admin" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Owner / Admin Sign In
            </Link>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}
