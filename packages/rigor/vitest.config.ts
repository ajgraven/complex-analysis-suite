import { defineConfig } from "vitest/config";

// @cas/rigor's unit tests. Registered in the root vitest.workspace.ts so one `pnpm test` at the
// repo root runs it alongside everything else. Tests import the TS source directly.
export default defineConfig({
  test: {
    name: "rigor",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
