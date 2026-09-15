import { defineConfig } from "vitest/config";

// End-to-end checks against the built app. Kept out of vitest's default
// include (which `npm test` uses) by the `.e2e.ts` suffix.
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.e2e.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
    reporters: ["verbose"],
  },
});
