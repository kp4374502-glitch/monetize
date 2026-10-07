import { currentUser } from "@clerk/nextjs/server";
import { getCreatorProfile } from "./service";
import { CREATOR_SIGNUP_FLOW, SIGNUP_FLOW_KEY, isOnboardingPending } from "./flow";

/**
 * Server check: should this signed-in user be sent back to /onboarding? See isOnboardingPending.
 * Accounts without the self-serve sign-up flag return early, before any creator_profiles query, so
 * existing users never depend on that table.
 */
export async function needsOnboarding(_userId: string): Promise<boolean> {
  const user = await currentUser();
  if (user?.unsafeMetadata?.[SIGNUP_FLOW_KEY] !== CREATOR_SIGNUP_FLOW) return false;
  return isOnboardingPending(user.unsafeMetadata, await getCreatorProfile(user.id));
}
