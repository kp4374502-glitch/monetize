"use client";

import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { deleteClipAction } from "@/app/campaigns/clip-actions";

/**
 * Owner/Admin only — the service re-checks this regardless of what the UI shows. Soft delete, but
 * from the reviewer's side it looks and feels permanent, so this confirms before submitting: a
 * native browser confirm() is enough here, this app has no custom modal infrastructure elsewhere.
 */
export function DeleteClipButton({ campaignId, clipId }: { campaignId: string; clipId: string }) {
  return (
    <ActionForm
      action={deleteClipAction.bind(null, campaignId, clipId)}
      className="inline"
      onSubmit={(e) => {
        if (!confirm("Delete this clip? This removes it from every list — the audit trail is kept, but this can't be undone from the UI.")) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="danger" size="sm" aria-label="Delete clip" data-testid="delete-clip">
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </ActionForm>
  );
}
