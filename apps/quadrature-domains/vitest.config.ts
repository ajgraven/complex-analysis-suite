import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The QD app's headless suite lives in app/test/<name>.test.js — 26 CommonJS files exporting
// `async run()`, booted by a shared vm-context (test/bootstrap.js) that installs globals. Refactor
// Stage B1 runs each file as its OWN Vitest spec under vitest/node/ (via vitest/node/_run.ts), so
// Vitest PARALLELISES them across workers and a failure names the specific file — replacing the earlier
// single serial wrapper that spawned `node app/node-test.js` and defeated Vitest's pool (finding
// QD-TEST-1). app/node-test.js is kept intact for standalone `node app/node-test.js` runs.
export default defineConfig({
  // @cas/exact intentionally exports only its built dist/ to application code.
  // The cross-engine differential spec must also run in a clean checkout, before
  // that package has been built, so its test-only import resolves to the source.
  resolve: {
    alias: {
      "@cas/exact": fileURLToPath(new URL("../../packages/exact/src/index.ts", import.meta.url)),
    },
  },
  test: {
    name: "quadrature-domains",
    environment: "node",
    include: ["vitest/**/*.test.ts"],
    // The real-browser boot specs live in vitest/browser/*.browser.test.ts and run under
    // vitest.browser.config.ts (Playwright/Chromium). This node project's glob would otherwise ALSO
    // match `*.browser.test.ts` and run them without a DOM ("document is not defined"), so exclude them.
    exclude: [...configDefaults.exclude, "vitest/browser/**"],
    // The child runs the entire real suite (heavy solver numerics — ~7 min cold on CI).
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
