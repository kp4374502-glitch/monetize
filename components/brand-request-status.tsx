import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { brandRequests } from "@/drizzle/schema";

type BrandRequest = typeof brandRequests.$inferSelect;

const copy: Record<BrandRequest["status"], string> = {
  pending: "We've received your request. The platform team reviews every brand by hand and will be in touch.",
  approved: "You're approved. The platform team will set up your campaign and assign it to you.",
  rejected: "This request wasn't approved. If you think that's a mistake, contact the platform team.",
};

/** What a requester sees about their own brand request. */
export function BrandRequestStatus({ request }: { request: BrandRequest }) {
  return (
    <Card data-testid="brand-request-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Brand request</p>
          <h2 className="text-xl font-extrabold tracking-tight">{request.brandName}</h2>
        </div>
        <Badge status={request.status} />
      </div>
      <p className="mt-3 text-sm text-text-secondary">{copy[request.status]}</p>
    </Card>
  );
}
