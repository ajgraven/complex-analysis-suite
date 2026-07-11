import { defineConfig } from "vitest/config";

// Root-level Vitest options that apply ACROSS the workspace (projects themselves are defined in
// vitest.workspace.ts). This file exists solely to configure COVERAGE — Vitest honours a root
// config's `test.coverage` even when a workspace is present, and it is inert unless `--coverage`
// is passed, so the default `pnpm test` gate is unaffected. Run it with `pnpm test:coverage`.
//
// Scope (review P4 / P0-1..3 — the repo previously had NO coverage tooling at all): the v8 provider
// instruments code that runs INSIDE Vitest. That is the shared TS packages plus the Complex-Dynamics
// and Correspondences native suites. The Quadrature-Domains math surface (app/*.mjs) is exercised by
// its own headless `node app/node-test.js` runner in a SEPARATE, un-instrumented child process
// (wrapped as one Vitest spec), so it is deliberately excluded here — counting it would report the
// whole .mjs graph as ~0% and misrepresent a heavily-tested surface. Its coverage is the headless
// suite's per-file assertion floors (node-test.js FLOORS), not v8. GLSL templates are strings, never
// executed by v8, so they are excluded too (their execution is the dual-backend browser harness).
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "./coverage",
      all: true, // list instrumented-scope source even at 0%, so untested files are visible
      include: [
        "packages/*/src/**/*.{ts,tsx}",
        "apps/complex-dynamics/src/**/*.{ts,tsx}",
        "apps/correspondences/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.*",
        "**/*.config.*",
        "**/dist/**",
        "**/node_modules/**",
        "**/*.d.ts",
        "**/glsl/**", // GLSL template strings — executed by the browser dual-backend harness, not v8
      ],
      // No thresholds: this lands the measurement tooling (the P0 gap). Ratchet thresholds in a
      // follow-up once the baseline numbers are known — a threshold added blind could break CI.
    },
  },
});
