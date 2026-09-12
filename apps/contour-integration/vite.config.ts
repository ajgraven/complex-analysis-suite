/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

// Relative base so the production build also works when served from a Pages sub-path, matching every
// other app (CLAUDE.md decision 11). Port 5177: 5173 is complex-dynamics, 5175 correspondences,
// 5199 quadrature-domains.
export default defineConfig({
  base: "./",
  server: { port: 5177, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // `*.browser.test.ts` compiles the app's real GLSL and needs a live WebGL2 context, so it is
    // EXCLUDED from this node gate and run by `vitest.browser.config.ts` (`pnpm test:browser`) — the
    // same split @cas/gpu, complex-dynamics, the plotter and QD use. Without the exclude the node
    // gate picks them up and every `document.createElement` fails in a runner with no DOM.
    exclude: [...configDefaults.exclude, "test/**/*.browser.test.ts"],
  },
});
