import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Sign-in/sign-up and the invite-link redemption route stay public; everything else requires a
// session. Invite-link acceptance itself creates the session, so it can't require one first.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
