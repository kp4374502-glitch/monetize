"use client";

import { Bell, Check } from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import { dismissNotificationAction } from "@/app/notifications/actions";

export type NotificationItem = { id: string; message: string; type: string; createdAt: string };

const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const dot: Record<string, string> = {
  clip_approved: "bg-green-400",
  clip_rejected: "bg-red-400",
  payout_paid: "bg-gold-light",
  proof_reminder: "bg-amber-400",
  budget_low: "bg-amber-400",
};

/** Bell with unread-count badge and a dropdown list; the ✓ dismisses (marks read) a notification. */
export function NotificationMenu({ items }: { items: NotificationItem[] }) {
  return (
    <Dropdown
      testId="notification-bell"
      label={`Notifications${items.length ? `, ${items.length} unread` : ""}`}
      trigger={
        <span className="relative flex items-center">
          <Bell className="h-4 w-4" aria-hidden />
          {items.length > 0 && (
            <span className="absolute -right-2.5 -top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-gradient px-1 text-[10px] font-bold text-black">
              {items.length > 9 ? "9+" : items.length}
            </span>
          )}
        </span>
      }
    >
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-sm font-bold">Notifications</p>
        <p className="text-xs text-text-secondary">{items.length} unread</p>
      </div>
      {items.length === 0 && <p className="px-3 pb-4 pt-2 text-sm text-text-secondary">You&apos;re all caught up.</p>}
      <ul className="max-h-96 overflow-y-auto">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[n.type] ?? "bg-text-secondary"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{n.message}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{ago(n.createdAt)}</p>
            </div>
            <form action={dismissNotificationAction.bind(null, n.id)}>
              <Button variant="ghost" size="icon" aria-label="Mark as read" title="Mark as read">
                <Check className="h-4 w-4" />
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </Dropdown>
  );
}
