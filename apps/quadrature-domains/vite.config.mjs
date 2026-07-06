import { defineConfig } from "vite";

// Phase 2 — Vite for the Quadrature app (pre-flip build checks).
//
// Two throwaway entries, both `base: "./"` (static, Pages-friendly):
//   • esm-proof.html         — a page + a trivial native module worker importing the ESM leaf,
//                              the original proof that Vite bundles `new Worker(new URL(...,
//                              import.meta.url), { type: "module" })`.
//   • workers-build-check.html — imports the three REAL worker main-thread modules so Rollup
//                              statically bundles the solver / schwarz / param-slice module
//                              workers (+ the whole solver-graph import chain). This is the
//                              compile-time half of the task-#18 worker validation.
// The final Phase-2 flip repoints `rollupOptions.input` at app/index.html and deletes both
// checks once the classic-script graph is fully ESM-ified.
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: ["esm-proof.html", "workers-build-check.html"] },
  },
});
