import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { isPlatformOwner } from "@/lib/auth/roles";
import { listApprovedBrands } from "@/lib/brand/service";
import { NewCampaignForm } from "@/components/new-campaign-form";

export default async function NewCampaignPage() {
  const userId = await requireUserId();
  if (!(await isPlatformOwner(userId))) notFound(); // visible only to the platform Owner

  return <NewCampaignForm brands={await listApprovedBrands(userId)} />;
}
