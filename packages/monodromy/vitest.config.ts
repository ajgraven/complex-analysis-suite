import { defineConfig } from "vitest/config";

// @cas/monodromy's unit tests. Registered in the root vitest.workspace.ts so one `pnpm test` at the
// repo root runs it alongside everything else. Tests import the TS source directly.
export default defineConfig({
  test: {
    name: "monodromy",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
