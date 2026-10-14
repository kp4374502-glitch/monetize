import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { isPlatformOwner } from "@/lib/auth/roles";
import { listAdminCandidates, listPlatformAdmins } from "@/lib/team/service";
import { addAdminAction, removeAdminAction } from "@/app/campaigns/team-actions";
import { AssignForm, RemoveForm } from "@/components/team/assign-form";
import { Card, SectionHeader } from "@/components/ui/card";

/**
 * Platform Owner only: who is an Admin. (Mod/CPE and Brand viewers are assigned per campaign, from each
 * campaign's own page, by Owner or Admin.) Anyone else gets a plain 404 so the page's existence isn't advertised.
 */
export default async function TeamPage() {
  const userId = await requireUserId();
  if (!(await isPlatformOwner(userId))) notFound();

  const [admins, candidates] = await Promise.all([listPlatformAdmins(userId), listAdminCandidates(userId)]);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Team</h1>
        <p className="mt-2 text-text-secondary">
          Admins have full review powers on <strong className="text-text-primary">every</strong> campaign, can mark posts paid and
          can delete posts. Only you can make or remove an Admin.
        </p>
      </header>

      <section data-testid="admins-section">
        <SectionHeader
          title="Admins"
          count={admins.length}
          description="Pick from everyone who has signed up. They need to have signed in once."
          action={<AssignForm action={addAdminAction} usernames={candidates} listId="admin-candidates" submitLabel="Make Admin" />}
        />
        <Card>
          {admins.length === 0 && <p className="text-sm text-text-secondary">No Admins yet.</p>}
          <ul className="grid grid-cols-1 gap-2.5">
            {admins.map((a) => (
              <li key={a.userId} className="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="admin-row">
                <span className="font-bold">{a.username}</span>
                <RemoveForm action={removeAdminAction.bind(null, a.userId)} label="Remove Admin" confirmText={`Remove ${a.username} as Admin?`} />
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card innerClassName="text-sm text-text-secondary">
        <p className="font-bold text-text-primary">Who can do what</p>
        <ul className="mt-2 grid gap-1.5">
          <li><strong className="text-text-primary">Owner</strong>: everything, including making Admins.</li>
          <li><strong className="text-text-primary">Admin</strong>: every campaign; reviews, Post Approves, marks paid, deletes, and adds Mods/CPEs and Brand viewers.</li>
          <li><strong className="text-text-primary">Mod / CPE</strong>: one campaign; reviews posts, never marks paid or deletes. Added from that campaign&apos;s page.</li>
          <li><strong className="text-text-primary">Brand</strong>: one campaign; read-only. Added from that campaign&apos;s page.</li>
          <li><strong className="text-text-primary">Creator</strong>: submits posts and sees only their own.</li>
        </ul>
      </Card>
    </main>
  );
}
