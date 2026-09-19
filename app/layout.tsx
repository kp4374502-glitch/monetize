import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { NotificationBell } from "@/components/notification-bell";
import { CampaignSwitcher } from "@/components/campaign-switcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monetize",
  description: "Multi-tenant clipping campaign platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="bg-bg-primary text-text-primary min-h-screen">
          <header className="flex items-center justify-between border-b border-subtle px-6 py-3">
            <Link href="/" className="font-bold">
              Monetize
            </Link>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <CampaignSwitcher />
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
