import { defineConfig } from "vitest/config";

// Browser-mode Vitest project for the Complex Function Plotting Tool — the ONLY place the app's real
// GLSL is compiled. Mirrors apps/complex-dynamics/vitest.browser.config.ts and
// packages/gpu/vitest.browser.config.ts deliberately: same Playwright/Chromium provider, and it is NOT
// registered in the default `pnpm test` gate, so that gate never launches a browser. Run it via
// `pnpm test:browser` from the repo root (which runs @cas/gpu's harness, CD's, and this one) or from
// this package.
//
// Setup once per machine/CI: the Chromium binary (pnpm skips Playwright's postinstall). CI's `browser`
// job already installs it for the other harnesses; this config reuses that job, adding no new CI
// infrastructure.
//
// Scope note: `include` is narrowed to *.browser.test.ts so the app's node/jsdom suite is NOT dragged
// into a browser runner — those tests are unaffected and stay on the main gate.
export default defineConfig({
  test: {
    name: "complex-function-plotter-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
    },
  },
});
