import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// Multi-page: the app hub (index.html) and the Joukowski / Kármán–Trefftz airfoil transplant
// (airfoil.html, moved here in HD-1). The closed-form transplant gallery (gallery.html, HD-2) joins the
// `input` map when it lands — the multi-page pattern the pre-split 2d-electrostatics app uses.
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts):
// a node-environment suite for the app's pure math (the airfoil engine + the closed-form transplant
// maps). The WebGL2 render path is exercised by the build; the evaluators are pure and node-tested.
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: { main: "index.html", airfoil: "airfoil.html" },
    },
  },
  server: { port: 5183, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
