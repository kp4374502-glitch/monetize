import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Sign-in/sign-up and the invite-link redemption route stay public; everything else requires a
// session. Invite-link acceptance itself creates the session, so it can't require one first.
const isPublicRoute = createRouteMatcher([
  "/", // landing page for signed-out visitors (signed-in users are sent to their campaigns)
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite/(.*)",
  "/api/cron/(.*)", // authenticated by CRON_SECRET inside the route, not by a Clerk session
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
