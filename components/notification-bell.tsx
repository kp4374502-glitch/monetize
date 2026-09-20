import { auth } from "@clerk/nextjs/server";
import { listNotifications } from "@/lib/notifications";
import { NotificationMenu } from "@/components/notification-menu";

/** In-app bell: unread notifications persist until dismissed. Data fetched here, UI in the client menu. */
export async function NotificationBell() {
  // Paths the Clerk middleware skips (e.g. /index.html) still render this layout; auth() throws there.
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return null;
  }
  if (!userId) return null;

  let items: Awaited<ReturnType<typeof listNotifications>> = [];
  try {
    items = await listNotifications(userId);
  } catch {
    return null;
  }

  return (
    <NotificationMenu
      items={items.map((n) => ({ id: n.id, message: n.message, type: n.type, createdAt: n.createdAt.toISOString() }))}
    />
  );
}
