import { createCampaignAction } from "@/app/campaigns/actions";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const platforms = ["tiktok", "instagram", "youtube"];

/** The new-campaign form (rendered by /campaigns/new after its Owner-only check). */
export function NewCampaignForm({ brands = [] }: { brands?: { userId: string; brandName: string; username: string }[] }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <SectionHeader title="New campaign" description="Set the brand, the payout formula and the rules creators follow." />
      <form action={createCampaignAction} className="grid gap-5">
        <Card>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-text-secondary">Campaign</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand name"><Input name="brandName" required /></Field>
            <Field label="Campaign name"><Input name="name" required /></Field>
            {brands.length > 0 && (
              <Field
                label="Campaign owner"
                hint="Approved brands can own their campaign. You keep full authority over it either way."
                className="sm:col-span-2"
              >
                <Select name="brandOwnerUserId" defaultValue="">
                  <option value="">Me (platform Owner)</option>
                  {brands.map((b) => (
                    <option key={b.userId} value={b.userId}>
                      {b.brandName} — {b.username}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-text-secondary">Payout formula</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base rate ($)"><Input name="baseRate" type="number" step="0.01" min="0" required /></Field>
            <Field label="Divisor"><Input name="divisor" type="number" step="any" min="0" defaultValue={50} /></Field>
            <Field label="Max pay per post ($)"><Input name="maxPayPerPost" type="number" step="0.01" min="0" required /></Field>
            <Field label="View minimum"><Input name="viewMinimum" type="number" min="0" defaultValue={1000} /></Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-text-secondary">Budget &amp; limits</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total budget ($)"><Input name="totalBudget" type="number" step="0.01" min="0" required /></Field>
            <Field label="Mod mark-paid threshold ($)"><Input name="modMarkPaidThreshold" type="number" step="0.01" min="0" required /></Field>
            <Field label="Daily submission limit"><Input name="dailySubmissionLimit" type="number" min="1" defaultValue={100} /></Field>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium text-text-secondary">Eligible platforms</legend>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <label
                  key={p}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-subtle px-4 py-1.5 text-sm capitalize transition hover:border-gold-border/60 has-[:checked]:border-gold-border has-[:checked]:bg-gold-light/10 has-[:checked]:text-gold-light"
                >
                  <input type="checkbox" name="eligiblePlatforms" value={p} defaultChecked={p === "tiktok"} className="h-4 w-4 accent-[#f0c572]" />
                  {p}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg">Create campaign</Button>
        </div>
      </form>
    </main>
  );
}
