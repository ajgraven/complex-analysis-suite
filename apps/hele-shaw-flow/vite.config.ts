import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts):
// a node-environment suite for the Hele-Shaw math (the exact one-point family + the Polubarinova–Galin
// stepper). The DOM line-art render path is exercised by the app's build; the engines are pure and
// node-tested.
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      // Multi-page: a small landing hub (index.html), the exact Graven–Makarov "twisting" showpiece
      // (twist.html — closed form, and the QD → Hele-Shaw hand-off target, ADR-0036/M4d), and the
      // numerical interior-droplet Polubarinova–Galin evolver (droplet.html). Vite resolves these
      // relative to the app root.
      input: { main: "index.html", twist: "twist.html", droplet: "droplet.html" },
    },
  },
  server: { port: 5181, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
