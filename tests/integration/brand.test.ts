import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, validCampaign } from "./helpers";
import { users, platformAdmins, brandRequests, brandSignupAttempts, campaigns } from "../../drizzle/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(holder.db as object, p) }),
}));

import { LOCKOUT_WINDOW_MS, MAX_FAILED_ATTEMPTS, checkBrandCode } from "@/lib/brand/gate";
import * as brand from "@/lib/brand/service";
import * as campaignSvc from "@/lib/campaigns/service";
import { getRoleForCampaign } from "@/lib/auth/roles";

let db: Awaited<ReturnType<typeof createTestDb>>;
const SECRET = "let-me-in";
const req = { brandName: "Acme Co", discord: "acme#1234", note: "Launching in Q4" };

beforeAll(async () => {
  db = await createTestDb();
  holder.db = db;
  await db.insert(users).values([
    { id: "owner", username: "owner", isPlatformOwner: true },
    { id: "admin", username: "admin" },
    { id: "brand1", username: "brand1" },
    { id: "brand2", username: "brand2" },
    { id: "brand3", username: "brand3" },
    { id: "creator", username: "creator" },
  ]);
  await db.insert(platformAdmins).values({ userId: "admin" });
});

describe("shared-code gate with per-IP lockout", () => {
  it("is disabled (never passes) when BRAND_SIGNUP_CODE isn't configured", async () => {
    expect(await checkBrandCode(SECRET, "1.1.1.1", { secret: undefined })).toEqual({ ok: false, reason: "disabled" });
    expect(await checkBrandCode("", "1.1.1.1", { secret: "" })).toEqual({ ok: false, reason: "disabled" });
  });

  it("accepts the right code (trimmed) and rejects a wrong one, recording the failure", async () => {
    expect(await checkBrandCode(`  ${SECRET} `, "2.2.2.2", { secret: SECRET })).toEqual({ ok: true });
    expect(await checkBrandCode("nope", "2.2.2.2", { secret: SECRET })).toEqual({ ok: false, reason: "wrong" });
    expect(await db.select().from(brandSignupAttempts).where(eq(brandSignupAttempts.ip, "2.2.2.2"))).toHaveLength(1);
  });

  it("locks an IP out after the maximum misses — even for the correct code — but not other IPs", async () => {
    const ip = "3.3.3.3";
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      expect(await checkBrandCode("guess" + i, ip, { secret: SECRET })).toEqual({ ok: false, reason: "wrong" });
    }
    expect(await checkBrandCode(SECRET, ip, { secret: SECRET })).toEqual({ ok: false, reason: "locked" });
    expect(await checkBrandCode(SECRET, "4.4.4.4", { secret: SECRET })).toEqual({ ok: true });
  });

  it("a locked attempt doesn't extend the lock, and the IP is allowed again after the window", async () => {
    const ip = "5.5.5.5";
    const t0 = new Date("2026-09-20T12:00:00Z");
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await checkBrandCode("x" + i, ip, { secret: SECRET, now: t0 });
    const during = new Date(t0.getTime() + LOCKOUT_WINDOW_MS - 1000);
    expect(await checkBrandCode(SECRET, ip, { secret: SECRET, now: during })).toEqual({ ok: false, reason: "locked" });
    const after = new Date(t0.getTime() + LOCKOUT_WINDOW_MS + 1000);
    expect(await checkBrandCode(SECRET, ip, { secret: SECRET, now: after })).toEqual({ ok: true });
  });

  it("a successful entry clears that IP's earlier failures", async () => {
    const ip = "6.6.6.6";
    await checkBrandCode("bad", ip, { secret: SECRET });
    await checkBrandCode("bad", ip, { secret: SECRET });
    await checkBrandCode(SECRET, ip, { secret: SECRET });
    expect(await db.select().from(brandSignupAttempts).where(eq(brandSignupAttempts.ip, ip))).toHaveLength(0);
  });
});

describe("brand requests", () => {
  it("creates one pending request per user; a repeat submission returns the existing one", async () => {
    const first = await brand.submitBrandRequest("brand1", req);
    expect(first.created).toBe(true);
    expect(first.request).toMatchObject({ userId: "brand1", brandName: "Acme Co", status: "pending" });
    const again = await brand.submitBrandRequest("brand1", { ...req, brandName: "Changed Name" });
    expect(again.created).toBe(false);
    expect(again.request.brandName).toBe("Acme Co");
    expect(await db.select().from(brandRequests).where(eq(brandRequests.userId, "brand1"))).toHaveLength(1);
  });

  it("validates input: brand name and Discord are required, note is optional", async () => {
    await expect(brand.submitBrandRequest("brand2", { ...req, brandName: "  " })).rejects.toThrow();
    await expect(brand.submitBrandRequest("brand2", { ...req, discord: "" })).rejects.toThrow();
    const ok = await brand.submitBrandRequest("brand2", { brandName: "Beta", discord: "beta#1", note: "" });
    expect(ok.request.note).toBeNull();
  });

  it("only the platform Owner can list, approve or reject — not Admin, not the requester, not a creator", async () => {
    const [r] = await db.select().from(brandRequests).where(eq(brandRequests.userId, "brand1"));
    for (const who of ["admin", "brand1", "creator"]) {
      await expect(brand.listBrandRequests(who)).rejects.toThrow(/only the platform Owner/);
      await expect(brand.reviewBrandRequest(who, r.id, "approved")).rejects.toThrow(/only the platform Owner/);
    }
    expect((await brand.listBrandRequests("owner")).length).toBeGreaterThanOrEqual(2);
    // approving is not a self-service action: the row is still pending after all those denials
    expect((await db.select().from(brandRequests).where(eq(brandRequests.id, r.id)))[0].status).toBe("pending");
  });

  it("approve / reject records who and when, can be changed later, and lists pending first", async () => {
    const [r1] = await db.select().from(brandRequests).where(eq(brandRequests.userId, "brand1"));
    const approved = await brand.reviewBrandRequest("owner", r1.id, "approved");
    expect(approved).toMatchObject({ status: "approved", reviewedBy: "owner" });
    expect(approved.reviewedAt).not.toBeNull();
    const [r2] = await db.select().from(brandRequests).where(eq(brandRequests.userId, "brand2"));
    const list = await brand.listBrandRequests("owner");
    expect(list[0].request.id).toBe(r2.id); // brand2 still pending -> first
    expect((await brand.reviewBrandRequest("owner", r1.id, "rejected")).status).toBe("rejected");
    await brand.reviewBrandRequest("owner", r1.id, "approved");
    await expect(brand.reviewBrandRequest("owner", "00000000-0000-0000-0000-000000000000", "approved")).rejects.toThrow(/not found/);
  });

  it("counts pending requests", async () => {
    expect(await brand.countPendingBrandRequests()).toBe(1); // brand2
  });
});

describe("approved brand as campaign owner", () => {
  it("approval alone grants no authority: no platform-owner powers and no role on any campaign", async () => {
    expect(await brand.isApprovedBrand("brand1")).toBe(true);
    await expect(campaignSvc.createCampaign("brand1", validCampaign)).rejects.toThrow(/only the platform Owner/);
    const base = await campaignSvc.createCampaign("owner", validCampaign);
    expect(await getRoleForCampaign("brand1", base.id)).toBeNull();
  });

  it("the Owner can assign an approved brand as a campaign's owner; that brand is 'owner' there only", async () => {
    const mine = await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Mine" });
    const theirs = await campaignSvc.createCampaign("owner", { ...validCampaign, name: "Theirs" }, "brand1");
    expect(mine.ownerUserId).toBe("owner"); // default unchanged
    expect(theirs.ownerUserId).toBe("brand1");
    expect(await getRoleForCampaign("brand1", theirs.id)).toBe("owner");
    expect(await getRoleForCampaign("brand1", mine.id)).toBeNull();
    expect(await getRoleForCampaign("owner", theirs.id)).toBe("owner"); // platform Owner keeps authority
  });

  it("refuses to assign a pending, rejected or unknown brand", async () => {
    await expect(campaignSvc.createCampaign("owner", validCampaign, "brand2")).rejects.toThrow(/hasn't been approved/); // pending
    const [r3] = (await brand.submitBrandRequest("brand3", req), await db.select().from(brandRequests).where(eq(brandRequests.userId, "brand3")));
    await brand.reviewBrandRequest("owner", r3.id, "rejected");
    await expect(campaignSvc.createCampaign("owner", validCampaign, "brand3")).rejects.toThrow(/hasn't been approved/);
    await expect(campaignSvc.createCampaign("owner", validCampaign, "creator")).rejects.toThrow(/hasn't been approved/);
    expect((await db.select().from(campaigns).where(eq(campaigns.ownerUserId, "brand3"))).length).toBe(0);
  });

  it("listApprovedBrands returns only approved brands, Owner only", async () => {
    const list = await brand.listApprovedBrands("owner");
    expect(list.map((b) => b.userId)).toEqual(["brand1"]);
    await expect(brand.listApprovedBrands("admin")).rejects.toThrow(/only the platform Owner/);
  });

  it("a non-Owner still can't create a campaign even when naming an approved brand", async () => {
    await expect(campaignSvc.createCampaign("admin", validCampaign, "brand1")).rejects.toThrow(/only the platform Owner/);
  });
});
