import { defineConfig } from "vitest/config";

// @cas/conformal tests (test/**). Registered in the root vitest.workspace.ts. Pure numeric
// conformal-map fits (over @cas/core's least squares), so the node environment suffices.
export default defineConfig({
  test: {
    name: "conformal",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
