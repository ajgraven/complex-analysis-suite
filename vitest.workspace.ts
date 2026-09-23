import { defineWorkspace } from "vitest/config";

// One Vitest runner across the whole repo (ARCHITECTURE.md §9). `pnpm test` at the root runs
// every project listed here and produces a single green/red signal.
//
//  - @cas/core runs its golden corpus (Phase 3 — the first shared package).
//  - complex-dynamics runs its native Vitest suite (config in its vite.config.ts `test` block).
//  - quadrature-domains runs its original headless suite as 29 PER-FILE Vitest specs under
//    vitest/node/ (via vitest/node/_run.ts; see apps/quadrature-domains/vitest.config.ts).
//    (Re-measured 2026-09-20: this said "wrapped in a single Vitest spec", which was the faithful
//    low-risk port MIGRATION.md Phase 1 step 3 sanctioned — Refactor Stage B1 replaced it per
//    finding QD-TEST-1, and app/node-test.js is kept for standalone runs.)
//
// Further packages add themselves here as they are extracted (Phase 3+).
export default defineWorkspace([
  "./packages/core/vitest.config.ts",
  "./packages/exact/vitest.config.ts",
  "./packages/export/vitest.config.ts",
  "./packages/interchange/vitest.config.ts",
  "./packages/expr/vitest.config.ts",
  "./packages/gpu/vitest.config.ts",
  "./packages/schwarz/vitest.config.ts",
  "./packages/dynamics/vitest.config.ts",
  "./packages/conformal/vitest.config.ts",
  "./packages/faber/vitest.config.ts",
  "./packages/ui/vitest.config.ts",
  "./packages/flow/vitest.config.ts",
  "./packages/rigor/vitest.config.ts",
  "./apps/complex-dynamics/vite.config.ts",
  "./apps/complex-function-plotter/vite.config.ts",
  "./apps/correspondences/vite.config.ts",
  "./apps/contour-integration/vite.config.ts",
  "./apps/quadrature-domains/vitest.config.ts",
  "./apps/riemann-map/vite.config.ts",
  "./apps/argument-principle/vite.config.ts",
  "./apps/faber-transform/vite.config.ts",
  "./apps/2d-electrostatics/vite.config.ts",
  "./apps/2d-hydrodynamics/vite.config.ts",
  "./apps/hele-shaw-flow/vite.config.ts",
  "./apps/potential-theory/vite.config.ts",
  "./apps/polynomial-roots/vite.config.ts",
  "./apps/polynomial-root-analysis/vite.config.ts",
]);
