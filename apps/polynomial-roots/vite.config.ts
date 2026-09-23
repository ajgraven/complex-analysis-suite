import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// Single page: one index.html renders the root cloud of whichever alphabet is chosen (ADR-0046).
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts): a
// node-environment suite for the app's pure engine — the alphabet's derived symmetries, the orbit
// enumeration, the Aberth solver (pinned against @cas/core's Durand–Kerner), the tone map, the
// statistics, the permalink codec and the places. The WebGL2 stage is thin and is exercised by the
// separate browser suite (`pnpm test:browser`, vitest.browser.config.ts), which the default gate
// deliberately does not run.
//
// `worker.format: "es"` keeps the root-engine worker a module in the production build, matching the
// `new Worker(new URL(…), { type: "module" })` spawn form that scripts/check-built-artifacts.mjs
// verifies survived bundling.
export default defineConfig({
  base: "./",
  server: { port: 5184, strictPort: true },
  worker: { format: "es" },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.browser.test.ts", "node_modules/**"],
  },
});
