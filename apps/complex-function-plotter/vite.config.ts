/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11). Single-page for now; a 3D
// surface page can be added later as a second rollup input (Phase 5), à la correspondences.
export default defineConfig({
  base: "./",
  server: { port: 5176, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
