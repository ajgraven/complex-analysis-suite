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
      // Multi-page: the free-field sandbox (index.html), the Joukowski airfoil transplant
      // (airfoil.html), and the exterior Schwarz–Christoffel polygon transplant (polygon.html). The
      // Hele-Shaw pages (twist/droplet → hele-shaw-flow) and the potential-theory conductor view
      // (potential.html → potential-theory) split out into their own apps (ADR-0036). Vite resolves
      // these relative to the root.
      input: { main: "index.html", airfoil: "airfoil.html", polygon: "polygon.html" },
    },
  },
  server: { port: 5180, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
