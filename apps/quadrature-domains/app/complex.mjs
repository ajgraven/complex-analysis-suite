// =============================================================================
// complex.mjs -- re-export shim (Phase 3, MIGRATION.md).
//
// The object-representation complex arithmetic ({re,im}) that used to live here was
// extracted to the shared package @cas/core (packages/core/src/complex.ts — a strict-TS
// port of this file's former body, byte-for-byte behavior-identical). There is now a
// SINGLE implementation, in the package; this file is a thin alias so the ~30 QD importers
// (and the test-harness bootstrap) keep `import { Complex } from './complex.mjs'` unchanged.
//
// Vite bundles @cas/core's built dist into the app; the QD headless suite runs under bare
// `node`, which resolves @cas/core -> packages/core/dist/index.js via the package `exports`.
// Both get the same code, so the solver hot path is unchanged.
export { Complex, default } from "@cas/core";
