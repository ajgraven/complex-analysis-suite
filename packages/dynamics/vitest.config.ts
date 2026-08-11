import { defineConfig } from "vitest/config";

// @cas/dynamics tests (test/**). Registered in the root vitest.workspace.ts. Pure numeric
// inverse-Böttcher series (over @cas/core + @cas/expr), so the node environment suffices.
export default defineConfig({
  test: {
    name: "dynamics",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
