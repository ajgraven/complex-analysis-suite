import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Phase 2 — Vite config for the Quadrature app (the flip). `root` is app/ (the ESM graph); the
// entry is app/index.html, which loads main.mjs (the whole PAGE_SCRIPTS graph as native ES
// modules — the replacement for the classic asset-manifest.js + document.write loader).
//   • base: "./"          — relative asset paths, so the static dist/ works from a GitHub-Pages
//                           sub-path (matches CD).
//   • worker.format: "es" — the app spawns NATIVE module workers
//                           (new Worker(new URL("./workers/*.mjs", import.meta.url), {type:"module"})),
//                           replacing the old runtime-Blob worker bundling.
// One config serves both `vite` (dev, HMR) and `vite build` (static dist/).
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, "app"),
  base: "./",
  worker: { format: "es" },
  server: { port: 5199 },
  build: {
    outDir: resolve(here, "dist"),
    emptyOutDir: true,
  },
});
