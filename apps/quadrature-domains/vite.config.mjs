import { defineConfig } from "vite";

// Phase 2 — Vite for the Quadrature app (proof slice).
//
// This config currently builds ONLY the ESM proof entry (esm-proof.html): a page that
// spawns a native ES module worker importing the ESM leaf ports. It proves Vite bundles
// `new Worker(new URL(..., import.meta.url), { type: "module" })` — the replacement for the
// app's runtime-Blob worker bundling — and that `base: "./"` keeps a static, Pages-friendly
// output. The final Phase-2 flip repoints `rollupOptions.input` at app/index.html once the
// whole classic-script graph has been ESM-ified.
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: "esm-proof.html" },
  },
});
