import { defineConfig } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11). Port 5185: 5184 is Polynomial
// Roots' (ADR-0046), and this app is its neighbour rather than its successor (PLAN §1.2).
//
// The `test` block registers this app as a Vitest project (root vitest.workspace.ts). Node by
// default; a DOM spec opts into jsdom per FILE with a line-1 docblock, the suite's convention. The
// GLSL is compiled only by the separate browser suite (`pnpm test:browser`), which this excludes.
export default defineConfig({
  base: "./",
  server: { port: 5185, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.browser.test.ts", "node_modules/**"],
  },
});
