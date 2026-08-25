import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts):
// a node-environment suite for the field math. The WebGL2 render path is exercised by the app's
// build and (a later M0 slice) a browser parity test; the field evaluators are pure and node-tested.
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      // Multi-page: the free-field sandbox (index.html) and the Joukowski airfoil transplant
      // (airfoil.html). Vite resolves these HTML inputs relative to the project root.
      input: { main: "index.html", airfoil: "airfoil.html" },
    },
  },
  server: { port: 5180, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
