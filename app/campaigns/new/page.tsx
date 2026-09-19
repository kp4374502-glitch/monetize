import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/ensure-user";
import { isPlatformOwner } from "@/lib/auth/roles";
import { createCampaignAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const field = "flex flex-col gap-1 text-sm";

export default async function NewCampaignPage() {
  const userId = await requireUserId();
  if (!(await isPlatformOwner(userId))) notFound(); // visible only to the platform Owner

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-6 text-2xl font-bold">New campaign</h1>
      <form action={createCampaignAction} className="grid gap-4">
        <label className={field}>Brand name<Input name="brandName" required /></label>
        <label className={field}>Campaign name<Input name="name" required /></label>
        <div className="grid grid-cols-2 gap-4">
          <label className={field}>Base rate ($)<Input name="baseRate" type="number" step="0.01" min="0" required /></label>
          <label className={field}>Divisor<Input name="divisor" type="number" step="any" min="0" defaultValue={50} /></label>
          <label className={field}>Max pay per post ($)<Input name="maxPayPerPost" type="number" step="0.01" min="0" required /></label>
          <label className={field}>View minimum<Input name="viewMinimum" type="number" min="0" defaultValue={1000} /></label>
          <label className={field}>Total budget ($)<Input name="totalBudget" type="number" step="0.01" min="0" required /></label>
          <label className={field}>Mod mark-paid threshold ($)<Input name="modMarkPaidThreshold" type="number" step="0.01" min="0" required /></label>
          <label className={field}>Daily submission limit<Input name="dailySubmissionLimit" type="number" min="1" defaultValue={100} /></label>
        </div>
        <fieldset className="flex gap-4 text-sm">
          <legend className="mb-1">Eligible platforms</legend>
          {["tiktok", "instagram", "youtube"].map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" name="eligiblePlatforms" value={p} defaultChecked={p === "tiktok"} /> {p}
            </label>
          ))}
        </fieldset>
        <Button type="submit">Create campaign</Button>
      </form>
    </main>
  );
}
