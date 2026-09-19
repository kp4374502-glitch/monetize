import { auth } from "@clerk/nextjs/server";
import { listNotifications } from "@/lib/notifications";
import { dismissNotificationAction } from "@/app/notifications/actions";

/** Basic in-app bell: unread notifications persist until dismissed. */
export async function NotificationBell() {
  const { userId } = await auth();
  if (!userId) return null;

  let items: Awaited<ReturnType<typeof listNotifications>> = [];
  try {
    items = await listNotifications(userId);
  } catch {
    return null;
  }

  return (
    <details className="relative" data-testid="notification-bell">
      <summary className="cursor-pointer rounded-md border border-subtle px-3 py-1.5 text-sm">
        🔔 {items.length > 0 && <span className="text-gold-light">{items.length}</span>}
      </summary>
      <ul className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-subtle bg-bg-secondary p-1 text-sm">
        {items.length === 0 && <li className="px-3 py-2 text-text-secondary">No notifications</li>}
        {items.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-2 rounded px-3 py-2">
            <span>{n.message}</span>
            <form action={dismissNotificationAction.bind(null, n.id)}>
              <button className="text-text-secondary hover:text-text-primary" aria-label="Dismiss">✕</button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
