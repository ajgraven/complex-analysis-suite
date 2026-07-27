import { defineConfig } from "vite";
// `configDefaults` (used by the test.exclude below) is a value import from vitest/config; it also
// pulls in vitest's augmentation of Vite's UserConfig, so the `test` block type-checks without the
// former `/// <reference types="vitest/config" />` — which @typescript-eslint/triple-slash-reference
// now forbids precisely because an equivalent import is present.
import { configDefaults } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the production build also works when served from a
// sub-path (e.g. GitHub Pages project sites).
//
// vite-plugin-pwa gives CD the same offline/installable story QD already has: Workbox precaches
// the built bundle so the app works offline and installs to the home screen. autoUpdate = a new
// service worker activates on its own. CD has no third-party runtime dependencies (KaTeX is
// bundled), so no runtimeCaching is needed — the precache is the whole story.
export default defineConfig({
  base: "./",
  server: { port: 5173, strictPort: true },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,png,ttf,woff,woff2}"],
        // The WebGL engine + KaTeX make the main chunk large; precache it anyway.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Complex Dynamics Visualization Tool",
        short_name: "Complex Dynamics",
        description:
          "GPU escape-time visualizer for complex dynamics — Mandelbrot/multibrot, Julia sets, Tricorn/multicorn, Böttcher coordinates, external rays, matings, deep zoom.",
        start_url: "./index.html",
        scope: "./",
        display: "standalone",
        orientation: "any",
        theme_color: "#0f1115",
        background_color: "#0f1115",
        icons: [
          { src: "images/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "images/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
        categories: ["education", "science"],
      },
      devOptions: { enabled: false },
    }),
  ],
  // The node/jsdom suite. `*.browser.test.ts` compiles real GLSL and needs a live WebGL2 context,
  // so it is EXCLUDED here and run by the separate vitest.browser.config.ts (`pnpm test:browser`) —
  // the same split @cas/gpu uses. Without the exclude the main gate picks those files up and they
  // fail on `HTMLCanvasElement.prototype.getContext` not being implemented in jsdom.
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/**/*.browser.test.ts"],
  },
});
