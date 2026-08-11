import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11). Single-page for now; a 3D
// surface page can be added later as a second rollup input (Phase 5), à la correspondences.
export default defineConfig({
  base: "./",
  server: { port: 5176, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // `*.browser.test.ts` compiles the app's real GLSL and needs a live WebGL2 context, so it is
    // EXCLUDED from this node gate and run by vitest.browser.config.ts (`pnpm test:browser`) — the same
    // split @cas/gpu and complex-dynamics use. Without the exclude the node gate would pick them up and
    // they'd fail with no WebGL2.
    exclude: [...configDefaults.exclude, "test/**/*.browser.test.ts"],
  },
});
