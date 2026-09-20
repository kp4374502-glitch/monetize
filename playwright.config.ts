import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Playwright doesn't read .env.local; global setup and the sign-in helper need the Clerk keys.
loadEnvConfig(process.cwd(), true);

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
