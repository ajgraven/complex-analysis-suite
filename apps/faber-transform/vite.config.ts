import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts):
// a node-environment suite over the pure modules (faber glue, presets, viewState). M1 is pure-2D
// (no WebGL); GPU domain-coloring arrives at M2 after the @cas/gpu shader extraction.
export default defineConfig({
  base: "./",
  server: { port: 5178, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
