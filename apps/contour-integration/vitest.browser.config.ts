import { defineConfig } from "vitest/config";

// Browser-mode Vitest project for Contour Integration — the ONLY place this app's real GLSL is
// compiled, and the home of M4's CPU↔GPU branch-cut parity gate. Mirrors
// `apps/complex-function-plotter/vitest.browser.config.ts`, `apps/complex-dynamics/…` and
// `packages/gpu/…`: same Playwright/Chromium provider, and NOT registered in the default `pnpm test`
// gate, so that gate never launches a browser. Run it via `pnpm test:browser` from the repo root or
// from this package.
//
// Scope note: `include` is narrowed to `*.browser.test.ts` so the app's 50-file node suite is not
// dragged into a browser runner.
//
// **ONE LINE THE OTHER THREE DO NOT HAVE**, and the reason is worth stating. Playwright pins an exact
// Chromium build and `pnpm` skips its postinstall, so a container that HAS a Chromium — but one
// downloaded for a different Playwright version — cannot launch the provider at all, and the parity
// gate becomes a suite nobody can run outside CI. `CAS_CHROMIUM_EXECUTABLE` lets such an environment
// name its own binary; unset (CI, where the `browser` job runs `playwright install`) nothing changes.
// The other three configs could take the same line and would be better for it.
const executablePath = process.env.CAS_CHROMIUM_EXECUTABLE;

export default defineConfig({
  test: {
    name: "contour-integration-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      ...(executablePath === undefined ? {} : { providerOptions: { launch: { executablePath } } }),
    },
  },
});
