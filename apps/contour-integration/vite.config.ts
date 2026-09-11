/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Relative base so the production build also works when served from a Pages sub-path, matching every
// other app (CLAUDE.md decision 11). Port 5177: 5173 is complex-dynamics, 5175 correspondences,
// 5199 quadrature-domains.
export default defineConfig({
  base: "./",
  server: { port: 5177, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
