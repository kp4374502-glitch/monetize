import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // tsconfig has jsx: "preserve" (Next compiles it), which Vite can't parse — only matters for tests
  // that render a .tsx component.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    // Each integration file boots its own in-process Postgres (PGlite) and pushes the schema in
    // beforeAll; under load (parallel files, other processes) that can exceed the 10s default.
    hookTimeout: 90000,
  },
});
