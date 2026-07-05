import { defineConfig } from "vitest/config";

// The QD app's original headless suite (app/node-test.js: 28 files, ~2200 assertions) is a
// self-contained CommonJS runner that boots a `vm` context, installs globals, and calls
// process.exit(). Rather than rewrite 28 files (and risk changing behavior), Phase 1 runs it
// UNCHANGED under Vitest via one wrapper spec that spawns `node app/node-test.js` and asserts
// it exits 0 (MIGRATION.md Phase 1 step 3: "run initially as a separate vitest-invoked
// wrapper"). A deeper per-file port can come later; this already gives the repo one runner.
export default defineConfig({
  test: {
    name: "quadrature-domains",
    environment: "node",
    include: ["vitest/**/*.test.ts"],
    // The child runs the entire real suite (heavy solver numerics — ~7 min cold on CI).
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
