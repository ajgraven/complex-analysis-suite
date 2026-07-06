import { defineConfig } from "vitest/config";

// @cas/core's golden corpus (test/**). Registered in the root vitest.workspace.ts so a single
// `pnpm test` at the repo root runs it alongside both apps' suites. Tests import the TS source
// directly (Vitest transpiles it) — no build step needed for the test loop; the `build` script
// is only for producing the `dist/` that the apps consume.
export default defineConfig({
  test: {
    name: "core",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
