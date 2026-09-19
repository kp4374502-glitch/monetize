import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "../db/client";
import { users } from "../../drizzle/schema";

/** Returns the signed-in Clerk user's ID, mirroring them into `users` on first sight. */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in.");
  const u = await currentUser();
  await db
    .insert(users)
    .values({ id: userId, username: u?.username ?? userId })
    .onConflictDoNothing({ target: users.id });
  return userId;
}
