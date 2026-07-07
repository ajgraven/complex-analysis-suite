/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      // Multi-page: the four dynamical views (index.html) and the mating explorer (mating.html). Vite
      // resolves these HTML inputs relative to the project root.
      input: { main: "index.html", mating: "mating.html" },
    },
  },
  server: { port: 5175, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
