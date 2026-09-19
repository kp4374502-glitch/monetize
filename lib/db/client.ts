import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../drizzle/schema";

export type Db = PostgresJsDatabase<typeof schema>;

let _db: Db | undefined;

function getDb(): Db {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set — add it to .env.local.");
    }
    _db = drizzle(postgres(process.env.DATABASE_URL), { schema });
  }
  return _db;
}

// Lazy proxy so importing this module never requires a connection (e.g. during `next build`).
export const db: Db = new Proxy({} as Db, {
  get: (_t, prop) => Reflect.get(getDb(), prop),
});
