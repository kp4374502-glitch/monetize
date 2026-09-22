"use client";

import { useActionState } from "react";

export type ActionState = { error?: string; ok?: boolean; message?: string };

/** A form whose server action returns {error} instead of throwing, so users see a friendly message. */
export function ActionForm({
  action,
  children,
  className,
  onSubmit,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  /** e.g. a confirm() gate — call e.preventDefault() to stop the submission. */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className={className} onSubmit={onSubmit}>
      {children}
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-400" data-testid="form-error">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="mt-2 text-sm text-gold-light" data-testid="form-message">
          {state.message}
        </p>
      )}
    </form>
  );
}
