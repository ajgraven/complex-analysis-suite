import { defineWorkspace } from "vitest/config";

// One Vitest runner across the whole repo (ARCHITECTURE.md §9). `pnpm test` at the root runs
// every project listed here and produces a single green/red signal.
//
//  - @cas/core runs its golden corpus (Phase 3 — the first shared package).
//  - complex-dynamics runs its native Vitest suite (config in its vite.config.ts `test` block).
//  - quadrature-domains runs its original headless node-test.js suite unchanged, wrapped in a
//    single Vitest spec (see apps/quadrature-domains/vitest.config.ts) — the faithful,
//    low-risk port sanctioned by MIGRATION.md Phase 1 step 3.
//
// Further packages add themselves here as they are extracted (Phase 3+).
export default defineWorkspace([
  "./packages/core/vitest.config.ts",
  "./packages/exact/vitest.config.ts",
  "./packages/interchange/vitest.config.ts",
  "./packages/expr/vitest.config.ts",
  "./packages/gpu/vitest.config.ts",
  "./packages/schwarz/vitest.config.ts",
  "./packages/dynamics/vitest.config.ts",
  "./apps/complex-dynamics/vite.config.ts",
  "./apps/correspondences/vite.config.ts",
  "./apps/quadrature-domains/vitest.config.ts",
  "./apps/riemann-map/vite.config.ts",
]);
