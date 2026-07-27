import { defineConfig } from "vitest/config";

// Browser-mode Vitest project for Complex Dynamics — the ONLY place the app's real GLSL is compiled
// (cd-shader-uncompiled-07). Mirrors packages/gpu/vitest.browser.config.ts deliberately: same
// Playwright/Chromium provider, same "not registered in vitest.workspace.ts" arrangement, so the
// default `pnpm test` gate never launches a browser. Run it via `pnpm test:browser` from the repo
// root (which runs @cas/gpu's harness and this one) or from this package.
//
// Setup once per machine/CI: `npx playwright install chromium` — pnpm skips playwright's
// postinstall, so the browser binary is not fetched by `pnpm install`. CI's `browser` job already
// does this for the @cas/gpu harness; this config reuses that job, adding no new CI infrastructure.
//
// Scope note: `include` is narrowed to *.browser.test.ts so the app's large node/jsdom suite does
// NOT get dragged into a browser runner — those tests are unaffected and stay on the main gate.
export default defineConfig({
  test: {
    name: "complex-dynamics-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
    },
  },
});
