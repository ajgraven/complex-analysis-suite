import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// A single-page app (the conductor view is index.html), so no multi-page rollupOptions.input is
// needed. The `test` block registers this app as a Vitest project (added to the root
// vitest.workspace.ts): a node-environment suite for the potential-theory math (the exterior-map
// pushforwards, the log-lightning fit, Faber zeros, Fekete/Leja points).
export default defineConfig({
  base: "./",
  server: { port: 5182, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
