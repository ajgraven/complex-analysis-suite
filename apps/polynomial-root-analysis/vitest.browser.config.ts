import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Browser-mode Vitest project for Polynomial Root Analysis — the ONLY place this app's GLSL is
// compiled: the phase portrait and its pseudozero layer, whose f = log₁₀(|p|/w) is compared here
// against a float64 evaluation pixel by pixel. The node gate has no WebGL2 context. NOT registered in
// the default `pnpm test` gate.
//
// `CAS_CHROMIUM_EXECUTABLE ?? /opt/pw-browsers/chromium`, in that order — Playwright pins an exact
// Chromium build and `pnpm` skips its postinstall, so a container holding a Chromium downloaded for a
// different Playwright version cannot launch the provider at all. In CI the variable is unset and the
// path absent, so the provider uses its own build.
const LOCAL_CHROME = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.CAS_CHROMIUM_EXECUTABLE ??
  (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);

// Vitest browser mode defaults to a 414x896 phone; this app's stage is a desktop grid. A test that
// measures the canvas would otherwise be measuring an overflowed layout.
const viewport = { width: 1280, height: 900 };

export default defineConfig({
  test: {
    name: "polynomial-root-analysis-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      viewport,
      ...(executablePath === undefined
        ? {}
        : { providerOptions: { launch: { executablePath } } }),
    },
  },
});
