import { existsSync } from "node:fs";
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
// **THE LINE THIS CONFIG INTRODUCED, AND TWO OF THE OTHER FIVE HAVE SINCE TAKEN**, and the reason is
// worth stating. (Re-measured 2026-09-20 across all six browser configs: this one, complex-dynamics
// and `packages/gpu` take `CAS_CHROMIUM_EXECUTABLE ?? /opt/pw-browsers/chromium`, both in that order —
// the latter two cite "apps/contour-integration's line" — quadrature-domains probes the path only, and
// complex-function-plotter and `packages/schwarz` take neither, so their suites cannot run in such a
// container. The comment had said "ONE LINE THE OTHER THREE DO NOT HAVE".) Playwright pins an exact
// Chromium build and `pnpm` skips its postinstall, so a container that HAS a Chromium — but one
// downloaded for a different Playwright version — cannot launch the provider at all, and the parity
// gate becomes a suite nobody can run outside CI. `CAS_CHROMIUM_EXECUTABLE` lets such an environment
// name its own binary; unset (CI, where the `browser` job runs `playwright install`) nothing changes.
// complex-function-plotter and `packages/schwarz` could still take the same line and would be better
// for it.
//
// The `/opt/pw-browsers/chromium` probe is `packages/gpu`'s addition, taken here so the suite runs in
// the managed dev container with NOTHING set — CLAUDE.md tells a session to run this suite whenever a
// slice touches the stage, and a suite that needs an undocumented incantation first is one that gets
// skipped. In CI the variable is unset and the path absent, so the provider uses its own build.
const LOCAL_CHROME = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.CAS_CHROMIUM_EXECUTABLE ?? (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);

// **THE DEFAULT VIEWPORT IS A PHONE, AND THIS APP'S LAYOUT DOES NOT FIT IN ONE.** Vitest browser
// mode defaults to 414 x 896; the shell is a desktop grid whose rail is 19rem and whose strip is
// 16rem, so at 414 px wide the rail alone takes 304 of them and the whole shell overflows — which is
// a real defect (M7.1 recorded it) but not the layout any mounted-app test means to exercise. A
// pointer test written against it is aiming at a stage that has already overflowed the window, which
// is how M7.2c's first draft came to place "vertices" outside the drawing surface. Everything here
// still MEASURES the stage rather than assuming it; this only puts the app in the shape it is for.
const viewport = { width: 1280, height: 900 };

export default defineConfig({
  test: {
    name: "contour-integration-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      viewport,
      ...(executablePath === undefined ? {} : { providerOptions: { launch: { executablePath } } }),
    },
  },
});
