/// <reference types="vitest/config" />
import { defineConfig } from "vite";
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
        // woff2 only. KaTeX emits each face three times (ttf / woff / woff2) and its @font-face
        // lists them as a progressive fallback, so a browser takes the FIRST it supports — and
        // woff2 has been universally supported since ~2016, well before the WebGL2 this app
        // requires. Precaching the other two downloaded 797 KiB per app on service-worker install
        // that no browser capable of running it will ever request. They still SHIP in dist/, so the
        // fallback chain is intact for anything exotic; they are simply not fetched up front.
        // (bt-precache-fonts-04)
        globPatterns: ["**/*.{js,css,html,svg,ico,png,woff2}"],
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
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
