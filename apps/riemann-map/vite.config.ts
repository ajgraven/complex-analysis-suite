/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// P0 is a single-page empty shell. The `test` block registers this app as a Vitest project (added to
// the root vitest.workspace.ts): node environment for the pure-logic suite. A headless-WebGL2 browser
// project + the CI `browser` job are deferred to P1, when the first real shaders land and there is an
// actual GLSL≈JS parity to guard (matching how the other apps only compile shaders once they exist).
export default defineConfig({
  base: "./",
  server: { port: 5176, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
