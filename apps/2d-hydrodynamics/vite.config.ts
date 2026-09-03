import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// Single-page (ADR-0038, HD-6): one index.html renders EVERY body — the closed-form gallery and the
// Joukowski / Kármán–Trefftz airfoil — through the unified ψ: 𝔻* → ext(B) framework, switched by a Body
// selector. (This collapsed the ADR-0037 three-page shape: the hub + airfoil.html + gallery.html.)
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts):
// a node-environment suite for the app's pure math (the airfoil engine + the unified body model + the
// permalink codec). The WebGL2 render path is exercised by the build; the evaluators are pure and
// node-tested.
export default defineConfig({
  base: "./",
  server: { port: 5183, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
