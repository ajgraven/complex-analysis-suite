import { defineConfig } from "vitest/config";

// @cas/schwarz tests (test/**). Registered in the root vitest.workspace.ts. Pure numeric σ
// reconstruction (Newton + Durand–Kerner over @cas/core), so the node environment suffices.
export default defineConfig({
  test: {
    name: "schwarz",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
