import { existsSync } from "node:fs";
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
// Playwright pins an exact Chromium build and pnpm skips its postinstall, so a container that HAS a
// Chromium — one fetched for a different Playwright version — cannot launch the provider at all and the
// suite fails before collecting a test. `CAS_CHROMIUM_EXECUTABLE` lets such an environment name its own
// binary (apps/contour-integration's line); the /opt/pw-browsers probe is the managed dev container's
// path, so the suite runs there with nothing set (apps/quadrature-domains' line). Both, in that order.
// In CI the `browser` job runs `playwright install`, the env var is unset and the path absent, so the
// provider uses its own revision-matched browser. Same test, every environment.
const LOCAL_CHROME = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.CAS_CHROMIUM_EXECUTABLE ?? (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);
const launch = executablePath === undefined ? undefined : { executablePath };

export default defineConfig({
  test: {
    name: "complex-dynamics-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      providerOptions: { launch },
    },
  },
});
