"use client";

import * as React from "react";
import {
  Award,
  Bell,
  Calculator,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileText,
  Hash,
  Link2,
  Package,
  Pencil,
  Ticket,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChannelPostForm } from "@/components/channels/channel-post-form";
import {
  createChannelPostAction,
  deleteChannelPostAction,
  markChannelReadAction,
  updateChannelPostAction,
} from "@/app/campaigns/channel-actions";
import { CHANNEL_NAMES, linkText, type ChannelId } from "@/lib/channels/schemas";
import { cn } from "@/lib/utils";

export type PanelPost = {
  id: string;
  title: string;
  body: string;
  links: { url: string; label: string }[];
  createdAt: string;
  updatedAt: string;
};
export type PanelChannel = { id: ChannelId; unread: number; posts: PanelPost[] };

const ICONS: Record<ChannelId, LucideIcon> = {
  announcements: Bell,
  post_requirements: Ticket,
  cpm_calculation: Calculator,
  bonus: TrendingUp,
  link_in_bio_cta: Link2,
  content_brief: FileText,
  content_example: Award,
  assets: Package,
  how_to_submit_posts: CircleHelp,
};

const day = (iso: string) => iso.slice(0, 10); // UTC day, same on server and client
const wasEdited = (p: PanelPost) => new Date(p.updatedAt).getTime() - new Date(p.createdAt).getTime() > 60_000;

/** Message text with any http(s) address made clickable. Plain text only: nothing is ever rendered as HTML. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]*[^\s<.,;:!?)\]"'])/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-gold-light underline-offset-2 hover:underline">
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function PostCard({ campaignId, post, canPost }: { campaignId: string; post: PanelPost; canPost: boolean }) {
  const [editing, setEditing] = React.useState(false);
  if (editing) {
    return (
      <ChannelPostForm
        action={updateChannelPostAction.bind(null, campaignId, post.id)}
        submitLabel="Save changes"
        initial={{ title: post.title, body: post.body, links: post.links }}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <article className="rounded-xl border border-subtle bg-bg-primary px-3 py-2.5" data-testid="channel-post">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-bold">{post.title}</h3>
        <span className="shrink-0 text-xs text-text-secondary">
          {day(post.createdAt)}
          {wasEdited(post) && " · edited"}
        </span>
        {canPost && (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit post"
              className="rounded p-1 text-text-secondary transition hover:text-gold-light"
              data-testid="channel-post-edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <ActionForm
              action={deleteChannelPostAction.bind(null, campaignId, post.id)}
              className="inline"
              onSubmit={(e) => {
                if (!confirm("Delete this post? Creators will no longer see it.")) e.preventDefault();
              }}
            >
              <button type="submit" aria-label="Delete post" className="rounded p-1 text-red-400 transition hover:text-red-300" data-testid="channel-post-delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </ActionForm>
          </span>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary/90">
        <Linkified text={post.body} />
      </p>
      {post.links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {post.links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gold-border/50 px-2.5 py-1 text-xs font-semibold text-gold-light transition hover:bg-gold-light/10"
              data-testid="channel-post-link"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{linkText(l)}</span>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * The "Campaign channels" panel: a Discord-style list of rooms (announcements, assets, brief...) on a
 * campaign's page. Click a channel to expand it. Owner/Admin also get posting controls. On a phone the
 * whole panel is a collapsed card (it sits above the submission card); from the lg breakpoint it is a
 * right-hand column that's always open.
 */
export function ChannelsPanel({
  campaignId,
  canPost,
  channels,
}: {
  campaignId: string;
  canPost: boolean;
  channels: PanelChannel[];
}) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [open, setOpen] = React.useState<ChannelId | null>(null);
  const [composing, setComposing] = React.useState<ChannelId | null>(null);
  const [seen, setSeen] = React.useState<Set<ChannelId>>(new Set());
  const [, startTransition] = React.useTransition();

  const unreadOf = (c: PanelChannel) => (seen.has(c.id) ? 0 : c.unread);
  const totalUnread = channels.reduce((n, c) => n + unreadOf(c), 0);

  function toggle(c: PanelChannel) {
    const opening = open !== c.id;
    setOpen(opening ? c.id : null);
    setComposing(null);
    if (opening && unreadOf(c) > 0) {
      setSeen((prev) => new Set(prev).add(c.id));
      startTransition(() => {
        void markChannelReadAction(campaignId, c.id);
      });
    }
  }

  return (
    <Card innerClassName="p-2.5" data-testid="channels-panel">
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        aria-expanded={panelOpen}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 text-left lg:pointer-events-none"
      >
        <Hash className="h-[18px] w-[18px] shrink-0 text-gold-light" aria-hidden />
        <span className="font-bold">Campaign channels</span>
        {totalUnread > 0 && (
          <span className="ml-auto rounded-full bg-gold-light px-2 py-0.5 text-xs font-semibold text-black" data-testid="channels-unread-total">
            {totalUnread} new
          </span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-text-secondary transition lg:hidden", totalUnread === 0 && "ml-auto", panelOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      <div className={cn("mt-1 space-y-0.5", panelOpen ? "block" : "hidden lg:block")}>
        {channels.map((c) => {
          const Icon = ICONS[c.id];
          const isOpen = open === c.id;
          const unread = unreadOf(c);
          return (
            <div key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c)}
                aria-expanded={isOpen}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition",
                  isOpen ? "bg-white/[0.07] text-text-primary" : "text-text-secondary hover:bg-white/5 hover:text-text-primary",
                )}
                data-testid={`channel-${c.id}`}
              >
                <Icon className="h-[17px] w-[17px] shrink-0 text-gold-light" aria-hidden />
                <span className="min-w-0 truncate">{CHANNEL_NAMES[c.id]}</span>
                {unread > 0 && <span className="ml-auto rounded-full bg-gold-light px-2 py-0.5 text-xs font-semibold text-black">{unread} new</span>}
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-text-secondary transition", unread === 0 && "ml-auto", isOpen && "rotate-180")} aria-hidden />
              </button>
              {isOpen && (
                <div className="space-y-2 px-1 pb-3 pt-1.5">
                  {canPost &&
                    (composing === c.id ? (
                      <ChannelPostForm
                        action={createChannelPostAction.bind(null, campaignId, c.id)}
                        submitLabel={`Post to ${CHANNEL_NAMES[c.id]}`}
                        onDone={() => setComposing(null)}
                        onCancel={() => setComposing(null)}
                      />
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => setComposing(c.id)} data-testid="channel-new-post">
                        New post
                      </Button>
                    ))}
                  {c.posts.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-text-secondary">Nothing posted here yet.</p>
                  ) : (
                    c.posts.map((p) => <PostCard key={p.id} campaignId={campaignId} post={p} canPost={canPost} />)
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
