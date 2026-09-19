"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/ensure-user";
import { markNotificationRead } from "@/lib/notifications";

export async function dismissNotificationAction(id: string) {
  await markNotificationRead(await requireUserId(), id);
  revalidatePath("/", "layout");
}
