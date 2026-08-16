import { defineConfig } from "vitest/config";

// @cas/faber's unit tests (test/**). Registered in the root vitest.workspace.ts so a single `pnpm test`
// at the repo root runs it alongside the packages and apps. Tests import the TS source directly (Vitest
// transpiles it) — no build step needed for the test loop; the `build` script only produces the `dist/`
// that the apps and the QD raw-Node runner consume.
export default defineConfig({
  test: {
    name: "faber",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
