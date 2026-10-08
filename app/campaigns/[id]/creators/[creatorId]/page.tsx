import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { getCampaignForUser, getRoleForCampaign } from "@/lib/auth/roles";
import { getCreatorDetailsForAdmin } from "@/lib/creators/service";
import { CreatorDetailsView } from "@/components/creators/creator-details-view";

/**
 * One creator's onboarding form details, for Owner/Admin only. Sensitive (phone, birthday), so Mods,
 * creators and Brand get a plain "not found" -- same as a creator who isn't on this campaign.
 */
export default async function CreatorDetailsPage({ params }: { params: Promise<{ id: string; creatorId: string }> }) {
  const { id, creatorId } = await params;
  const userId = await requireUserId();
  const campaign = await getCampaignForUser(userId, id);
  if (!campaign) notFound();
  const role = await getRoleForCampaign(userId, id);
  if (role !== "owner" && role !== "admin") notFound();

  const d = await getCreatorDetailsForAdmin(userId, id, creatorId);
  if (!d) notFound();

  return <CreatorDetailsView campaign={campaign} campaignId={id} d={d} />;
}
