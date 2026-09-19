import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
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
