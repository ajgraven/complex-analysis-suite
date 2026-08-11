import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts):
// a node-environment suite. The studio is pure-2D (no WebGL) as of the GPU-free cut (C), so there is no
// browser project — the whole suite runs headless under node.
export default defineConfig({
  base: "./",
  server: { port: 5176, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
