/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Relative base so the production build also works when served from a
// sub-path (e.g. GitHub Pages project sites).
export default defineConfig({
  base: "./",
  server: { port: 5173, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
