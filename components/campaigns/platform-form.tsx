"use client";

import { ActionForm, type ActionState } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/campaigns/schemas";

/**
 * Owner/Admin control for which platforms a campaign accepts posts from. Same pill checkboxes as the
 * new-campaign form. Only affects new submissions; the server re-validates (at least one platform).
 */
export function PlatformForm({
  action,
  current,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  current: string[];
}) {
  return (
    <ActionForm action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => (
          <label
            key={p}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-subtle px-4 py-1.5 text-sm transition hover:border-gold-border/60 has-[:checked]:border-gold-border has-[:checked]:bg-gold-light/10 has-[:checked]:text-gold-light"
          >
            <input type="checkbox" name="eligiblePlatforms" value={p} defaultChecked={current.includes(p)} className="h-4 w-4 accent-[#ffb433]" />
            {PLATFORM_LABELS[p]}
          </label>
        ))}
      </div>
      <Button type="submit" size="sm">Save platforms</Button>
    </ActionForm>
  );
}
