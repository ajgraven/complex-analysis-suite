import { defineConfig, configDefaults } from "vitest/config";

// Relative base so the production build also works when served from a sub-path (GitHub Pages
// project site), matching the other apps (CLAUDE.md decision 11).
//
// The `test` block registers this app as a Vitest project (added to the root vitest.workspace.ts):
// node environment for the pure-logic suite. Real-WebGL2 specs live in *.browser.test.ts and run under
// the separate browser project (vitest.browser.config.ts, via `pnpm test:browser` / the CI browser
// job) — so they are EXCLUDED here, or the node runner would try to compile shaders without a GL
// context. This mirrors the Complex Dynamics app's split.
export default defineConfig({
  base: "./",
  server: { port: 5176, strictPort: true },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/**/*.browser.test.ts"],
  },
});
