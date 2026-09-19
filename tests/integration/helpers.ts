import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import * as schema from "../../drizzle/schema";

/** Real Postgres (in-process PGlite) with the real schema pushed — no mocks of query behaviour. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const { apply } = await pushSchema(schema, db as never);
  await apply();
  return db;
}

export const validCampaign = {
  brandName: "Acme",
  name: "Acme Launch",
  baseRate: 1,
  divisor: 50,
  maxPayPerPost: 500,
  viewMinimum: 1000,
  totalBudget: 10000,
  modMarkPaidThreshold: 50,
  dailySubmissionLimit: 100,
  eligiblePlatforms: ["tiktok", "youtube"],
};
