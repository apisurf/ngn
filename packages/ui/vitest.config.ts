import { defineConfig } from "vitest/config";

// Its own config so the tests do not load vite.config.ts: the TanStack Start and
// Nitro plugins there build an app, and a unit test needs none of it.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
