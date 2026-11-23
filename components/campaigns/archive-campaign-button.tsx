"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Owner/Admin only — the service re-checks that regardless of what the UI shows. Archiving hides the campaign
 * from every creator, so it confirms first (native confirm(), like the delete-post button). Unarchiving
 * restores the campaign to active with no confirmation: it only gives access back.
 * `action` is the bound setLifecycleAction server action ("archive" or "reopen").
 */
export function ArchiveCampaignButton({
  action,
  archived,
}: {
  action: () => Promise<void>;
  archived: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={
        archived
          ? undefined
          : (e) => {
              if (
                !confirm(
                  "Archive this campaign? Creators will no longer be able to see it or submit posts. The Owner, Admins, Mods and Brand viewers still can, and you can unarchive it any time.",
                )
              ) {
                e.preventDefault();
              }
            }
      }
    >
      <Button
        variant={archived ? "primary" : "outline"}
        size="sm"
        type="submit"
        data-testid={archived ? "unarchive-campaign" : "archive-campaign"}
      >
        {archived ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> : <Archive className="h-3.5 w-3.5" aria-hidden />}
        {archived ? "Unarchive" : "Archive"}
      </Button>
    </form>
  );
}
