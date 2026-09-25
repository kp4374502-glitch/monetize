import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Playwright doesn't read .env.local on its own — global setup and the sign-in helper need
// DATABASE_URL, the Clerk keys, and E2E_OWNER_USER from it. @next/env's loadEnvConfig() skips
// .env.local entirely whenever NODE_ENV=="test", and Playwright sets NODE_ENV=test on ITS OWN
// process before this file even runs — confirmed directly: E2E_OWNER_USER reads correctly with
// NODE_ENV unset, and reads as undefined with NODE_ENV=test. The webServer.env override below only
// fixes this for the SPAWNED dev server; it doesn't touch Playwright's own process, which is where
// this call actually runs. So: clear NODE_ENV just for this call, then restore it, rather than
// leaving Playwright's own process in an unintended state for the rest of the run.
// @types/node marks NODE_ENV readonly (to stop accidental writes elsewhere) — this is the one
// deliberate, temporary exception, so cast just for these four lines.
const mutableEnv = process.env as Record<string, string | undefined>;
const nodeEnvBeforeLoad = mutableEnv.NODE_ENV;
delete mutableEnv.NODE_ENV;
loadEnvConfig(process.cwd(), true);
if (nodeEnvBeforeLoad === undefined) delete mutableEnv.NODE_ENV;
else mutableEnv.NODE_ENV = nodeEnvBeforeLoad;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global.setup.ts",
  // The dev server compiles each route on first visit (several seconds); the 5s default is too tight.
  expect: { timeout: 30_000 },
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/sign-in", // a real 200 page; the bare root makes Playwright probe /index.html (404)
    reuseExistingServer: true,
    timeout: 120_000, // first compile of middleware + pages is slow
    // Defensive: Next.js does NOT load .env.local when NODE_ENV=test (DATABASE_URL and the Clerk keys
    // vanish), so never let a test-mode NODE_ENV leak into the dev server.
    env: { NODE_ENV: "development" },
  },
});
