import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { isPlatformOwner } from "@/lib/auth/roles";
import { listBrandRequests } from "@/lib/brand/service";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { reviewBrandRequestAction } from "./actions";

const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** Platform Owner only: review each brand request by hand. Approving grants no authority by itself. */
export default async function BrandRequestsPage() {
  const userId = await requireUserId();
  if (!(await isPlatformOwner(userId))) notFound();
  const rows = await listBrandRequests(userId);
  const pending = rows.filter((r) => r.request.status === "pending").length;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <SectionHeader
        title="Brand requests"
        count={rows.length}
        description={
          pending
            ? `${pending} waiting for your review. Approving lets you assign the brand as a campaign owner on “New campaign”.`
            : "Approving a brand lets you assign it as a campaign owner on “New campaign”."
        }
      />
      {rows.length === 0 && (
        <Card innerClassName="py-10 text-center text-sm text-text-secondary">No brand requests yet.</Card>
      )}
      <ul className="grid gap-3">
        {rows.map(({ request: r, username }) => (
          <li key={r.id} data-testid="brand-request-row">
            <Card innerClassName="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold tracking-tight">{r.brandName}</h2>
                  <p className="text-sm text-text-secondary">
                    Account: <span className="font-semibold text-text-primary">{username}</span> · Discord:{" "}
                    <span className="font-semibold text-text-primary">{r.discord}</span>
                  </p>
                  <p className="text-xs text-text-secondary">Requested {when(r.createdAt)}</p>
                </div>
                <Badge status={r.status} />
              </div>
              {r.note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm">{r.note}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
                {r.status !== "approved" && (
                  <ActionForm action={reviewBrandRequestAction.bind(null, r.id, "approved")}>
                    <Button type="submit" size="sm">Approve</Button>
                  </ActionForm>
                )}
                {r.status !== "rejected" && (
                  <ActionForm action={reviewBrandRequestAction.bind(null, r.id, "rejected")}>
                    <Button type="submit" variant="danger" size="sm">Reject</Button>
                  </ActionForm>
                )}
                {r.reviewedAt && <span className="text-xs text-text-secondary">Reviewed {when(r.reviewedAt)}</span>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
