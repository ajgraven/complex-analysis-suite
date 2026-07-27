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
  // Vite derives publicDir from `root`, which here is app/ — so without this it would look for
  // app/public and silently copy nothing. Point it at the package-level public/ (matching CD, whose
  // root IS the package dir): its contents are copied to the dist ROOT verbatim, unhashed, which is
  // exactly what manifest.webmanifest and icon.svg need for their relative URLs to resolve.
  publicDir: resolve(here, "public"),
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
      // `manifest: false` = "the app supplies its own". It does — public/manifest.webmanifest, linked
      // from index.html — and it must stay in public/, NOT in the Vite root (app/).
      //
      // It used to live at app/manifest.webmanifest, i.e. inside `root`, so Vite treated the
      // <link rel="manifest"> as an asset reference and emitted it as assets/manifest-<hash>.webmanifest
      // WITHOUT rewriting its contents. Every URL inside then resolved one directory too deep:
      // scope "./" → /quadrature-domains/assets/ (which does not contain the document), start_url
      // "./index.html" → a 404, and icons "icon.svg" → a 404 (the icon was hashed to
      // assets/icon-<hash>.svg). A manifest whose scope excludes its own page is ignored by the
      // installability check, so QD could not be installed as a PWA at all.
      //
      // public/ is copied to the dist ROOT verbatim, so the relative URLs resolve as written. The
      // icon moved alongside it for the same reason. CD reaches the same place from the other
      // direction — it has VitePWA GENERATE the manifest and keeps its icons in public/images/.
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
