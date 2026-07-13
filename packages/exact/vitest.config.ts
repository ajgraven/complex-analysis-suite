import { defineConfig } from "vitest/config";

// @cas/exact's unit tests (test/**). Registered in the root vitest.workspace.ts so a single `pnpm test`
// at the repo root runs it alongside the packages and apps. Tests import the TS source directly (Vitest
// transpiles it) — no build step needed for the test loop; the `build` script only produces the `dist/`
// that the apps consume.
export default defineConfig({
  test: {
    name: "exact",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
