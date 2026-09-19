import { auth } from "@clerk/nextjs/server";
import { isPlatformOwner, isPlatformAdmin } from "@/lib/auth/roles";

/**
 * Task 1 placeholder — not a real feature page. It exists to prove the app shell, Clerk auth, and
 * the tenant-scoped role layer are wired together end-to-end. Campaign switcher / dashboards are
 * later tasks (see TASK_01_FOUNDATION.md "Explicitly out of scope").
 */
export default async function Home() {
  const { userId } = await auth();

  let statusLine = "Not signed in.";
  if (userId) {
    const owner = await isPlatformOwner(userId);
    const admin = await isPlatformAdmin(userId);
    statusLine = `Signed in as ${userId}. Platform Owner: ${owner}. Platform Admin: ${admin}.`;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">
        Monetize <span className="italic text-gold-light">foundation</span>
      </h1>
      <p className="text-text-secondary">{statusLine}</p>
      <p className="text-text-secondary text-sm">
        This is a Task 1 placeholder page — campaign creation, invite links, and clip submission
        are later tasks.
      </p>
    </main>
  );
}
