import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getCampaignsForUser } from "@/lib/auth/roles";
import { Dropdown } from "@/components/dropdown";
import { Badge } from "@/components/ui/badge";

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
    <Dropdown
      testId="campaign-switcher"
      label="Switch campaign"
      trigger={
        <>
          <span>Campaigns</span>
          <span className="rounded-full bg-white/10 px-1.5 text-xs text-text-secondary">{list.length}</span>
        </>
      }
    >
      {list.length === 0 && <p className="px-3 py-3 text-sm text-text-secondary">No campaigns yet</p>}
      <ul className="max-h-80 overflow-y-auto">
        {list.map((c) => (
          <li key={c.id}>
            <Link
              href={`/campaigns/${c.id}`}
              role="menuitem"
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block truncate text-xs text-text-secondary">{c.brandName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {c.status !== "active" && <Badge status={c.status} />}
                <Badge status={c.role ?? "creator"} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Dropdown>
  );
}
