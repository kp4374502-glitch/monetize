import { auth } from "@clerk/nextjs/server";
import { isUuid } from "@/lib/auth/roles";
import { getProofImage } from "@/lib/clips/service";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * Serves an analytics-proof screenshot. The images live in a PRIVATE blob store, so this route is the only
 * way to read one, and it checks access every time: the clip's own creator, or a Mod/Admin/Owner of that
 * campaign. Anything else — signed out, wrong campaign, someone else's clip, no screenshot — is the same 404.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ campaignId: string; clipId: string }> }) {
  const { campaignId, clipId } = await ctx.params;
  if (!isUuid(campaignId) || !isUuid(clipId)) return notFound();

  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return notFound();
  }
  if (!userId) return notFound();

  try {
    const img = await getProofImage(userId, campaignId, clipId);
    return new Response(img.stream, {
      headers: {
        "Content-Type": img.contentType,
        "Content-Length": String(img.size),
        "Content-Disposition": 'inline; filename="analytics-proof"',
        // sensitive: never cached by shared caches or the CDN, and never sniffed or scripted
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return notFound();
  }
}
