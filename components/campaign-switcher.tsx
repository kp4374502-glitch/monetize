import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getCampaignsForUser } from "@/lib/auth/roles";

/** Uses the same role layer as everything else — no parallel lookup. Navigation is plain links. */
export async function CampaignSwitcher() {
  // Paths the Clerk middleware skips (e.g. /index.html) still render this layout; auth() throws there.
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return null;
  }
  if (!userId) return null;

  let list: Awaited<ReturnType<typeof getCampaignsForUser>> = [];
  try {
    list = await getCampaignsForUser(userId);
  } catch {
    return null; // e.g. database not configured yet — don't take the whole shell down
  }

  return (
    <details className="relative" data-testid="campaign-switcher">
      <summary className="cursor-pointer rounded-md border border-subtle px-3 py-1.5 text-sm">
        Campaigns ({list.length})
      </summary>
      <ul className="absolute right-0 z-10 mt-2 min-w-56 rounded-md border border-subtle bg-bg-secondary p-1 text-sm">
        {list.length === 0 && <li className="px-3 py-2 text-text-secondary">No campaigns yet</li>}
        {list.map((c) => (
          <li key={c.id}>
            <Link href={`/campaigns/${c.id}`} className="flex justify-between gap-4 rounded px-3 py-2 hover:bg-bg-primary">
              <span>
                {c.name}
                <span className="block text-xs text-text-secondary">
                  {c.brandName}
                  {c.status !== "active" && <span className="ml-2 rounded-full border border-gold-border px-1.5 text-gold-light">{c.status}</span>}
                </span>
              </span>
              <span className="text-text-secondary">{c.role}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
