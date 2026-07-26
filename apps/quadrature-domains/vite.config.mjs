import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Phase 2 — Vite config for the Quadrature app (the flip). `root` is app/ (the ESM graph); the
// entry is app/index.html, which loads main.mjs (the whole page graph as native ES modules — the
// replacement for the classic asset-manifest.js + document.write loader).
//   • base: "./"          — relative asset paths → static dist/ works from a GitHub-Pages sub-path.
//   • worker.format: "es" — the app spawns NATIVE module workers.
//   • vite-plugin-pwa     — Workbox service worker + precache (replaces the retired hand-rolled
//                           sw.js + gen-cache-version). autoUpdate = the new SW activates on its
//                           own. mathjs/KaTeX are now bundled + self-hosted (app/vendor-globals.mjs),
//                           so they fall under the glob precache below — no CDN runtime cache needed.
//                           Uses the existing app/manifest.webmanifest (linked in index.html), so
//                           `manifest: false`.
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
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      workbox: {
        // Bundled JS/CSS/fonts (incl. self-hosted mathjs + KaTeX + KaTeX fonts) are
        // precached — the app is fully offline-capable with no third-party runtime cache.
        // woff2 only — see the twin comment in apps/complex-dynamics/vite.config.ts. KaTeX ships
        // each face as ttf + woff + woff2 behind one @font-face fallback list; precaching all three
        // pulled 797 KiB per app that no WebGL2-capable browser ever requests. The files still ship
        // in dist/, so the fallback chain is intact. (bt-precache-fonts-04)
        globPatterns: ["**/*.{js,css,html,svg,woff2,webmanifest}"],
      },
      devOptions: { enabled: false },
    }),
  ],
});
