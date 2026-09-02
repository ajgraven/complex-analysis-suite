import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// HD-0 is a single hub page (index.html). The airfoil page (airfoil.html, HD-1) and the transplant
// gallery (gallery.html, HD-2) add themselves to a `build.rollupOptions.input` map as they land — the
// multi-page pattern the pre-split 2d-electrostatics app uses.
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts):
// a node-environment suite for the app's pure math (the closed-form transplant maps + the airfoil
// engine). The WebGL2 render path is exercised by the build; the evaluators are pure and node-tested.
export default defineConfig({
  base: "./",
  server: { port: 5183, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
