"use client";

import { UserButton } from "@clerk/nextjs";
import { MonitorSmartphone } from "lucide-react";
import { DevicesPanel } from "@/components/devices-panel";

/** The header's account button; adds a "Devices" tab to Clerk's Manage account dialog. */
export function AccountMenu() {
  return (
    <UserButton appearance={{ elements: { avatarBox: "h-8 w-8 ring-1 ring-gold-border/60" } }}>
      <UserButton.UserProfilePage label="Devices" url="devices" labelIcon={<MonitorSmartphone className="h-4 w-4" aria-hidden />}>
        <DevicesPanel />
      </UserButton.UserProfilePage>
    </UserButton>
  );
}
