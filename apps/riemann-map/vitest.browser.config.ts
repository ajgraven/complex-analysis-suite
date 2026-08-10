import { defineConfig } from "vitest/config";

// Browser-mode Vitest project for the Riemann-map app — the place its real GLSL is compiled + linked
// in a live WebGL2 context (a string codegen test cannot tell you the program builds). Mirrors the
// Complex Dynamics app's browser config: same Playwright/Chromium provider, and deliberately NOT in
// vitest.workspace.ts, so the default `pnpm test` gate never launches a browser. Run via
// `pnpm test:browser` from the repo root (which also runs @cas/gpu + CD) or from this app.
//
// Setup once per machine/CI: `npx playwright install chromium`. The CI `browser` job already does this.
export default defineConfig({
  test: {
    name: "riemann-map-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
    },
  },
});
