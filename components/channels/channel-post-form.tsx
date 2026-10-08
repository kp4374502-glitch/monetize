"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/components/action-form";
import { MAX_LINKS_PER_POST } from "@/lib/channels/schemas";

const textareaClass =
  "w-full rounded-xl border border-subtle bg-bg-secondary px-3.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/70 " +
  "transition focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold-light/20";

type Link = { url: string; label: string };

/**
 * Owner/Admin form for a channel post (new or edited): title, message, and up to three links (Drive,
 * Dropbox, example posts...). The server re-validates everything; this just collects the fields.
 */
export function ChannelPostForm({
  action,
  submitLabel,
  initial,
  onDone,
  onCancel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel: string;
  initial?: { title: string; body: string; links: Link[] };
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = React.useActionState(action, {} as ActionState);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDone();
    }
    // onDone is a fresh closure each render; only a new result should trigger this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const links = initial?.links ?? [];
  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-2 rounded-xl border border-gold-border/40 bg-bg-primary p-3"
      data-testid="channel-post-form"
    >
      <Input name="title" placeholder="Title" required maxLength={120} defaultValue={initial?.title} aria-label="Title" />
      <textarea
        name="body"
        rows={4}
        required
        maxLength={4000}
        placeholder="Write your message"
        defaultValue={initial?.body}
        aria-label="Message"
        className={textareaClass}
      />
      <details open={links.length > 0} className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-gold-light">
          Add links (up to {MAX_LINKS_PER_POST})
        </summary>
        <div className="mt-2 space-y-2">
          {Array.from({ length: MAX_LINKS_PER_POST }, (_, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem]">
              <Input
                name={`linkUrl${i + 1}`}
                type="url"
                inputMode="url"
                placeholder="https://drive.google.com/..."
                defaultValue={links[i]?.url}
                aria-label={`Link ${i + 1} address`}
              />
              <Input name={`linkLabel${i + 1}`} placeholder="Label" maxLength={60} defaultValue={links[i]?.label} aria-label={`Link ${i + 1} label`} />
            </div>
          ))}
        </div>
      </details>
      {state.error && (
        <p role="alert" className="text-sm text-red-400" data-testid="channel-form-error">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
