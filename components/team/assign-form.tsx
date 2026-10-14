"use client";

import * as React from "react";
import { ActionForm, type ActionState } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Pick a signed-up person and give them a role" form. The input is a username box with a dropdown of
 * everyone eligible (a <datalist>), so the Owner/Admin chooses from real accounts instead of typing
 * blind. The server re-validates the username regardless of what the browser sends.
 */
export function AssignForm({
  action,
  usernames,
  listId,
  placeholder = "Search a username",
  submitLabel = "Add",
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  usernames: string[];
  listId: string;
  placeholder?: string;
  submitLabel?: string;
}) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-center gap-2">
      <Input name="username" list={listId} placeholder={placeholder} autoComplete="off" required className="w-56" />
      <datalist id={listId}>
        {usernames.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <Button type="submit" size="sm">{submitLabel}</Button>
    </ActionForm>
  );
}

/** A one-click remove button as its own form so its error (if any) renders beside it. */
export function RemoveForm({
  action,
  label = "Remove",
  confirmText,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  label?: string;
  confirmText?: string;
}) {
  return (
    <ActionForm
      action={action}
      onSubmit={confirmText ? (e) => { if (!confirm(confirmText)) e.preventDefault(); } : undefined}
    >
      <Button variant="outline" size="sm" type="submit">{label}</Button>
    </ActionForm>
  );
}
