import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// The managed dev container pre-provisions a Chromium at /opt/pw-browsers whose revision may not
// match the one the installed Playwright expects, so point the provider straight at that binary when
// it exists (the env's documented workaround — do NOT `playwright install`). In CI the `browser` job
// runs `playwright install --with-deps chromium`, so this path is absent there and the provider uses
// its own freshly-installed, revision-matched browser (no override). Same test, both environments.
const LOCAL_CHROME = "/opt/pw-browsers/chromium";
const launch = existsSync(LOCAL_CHROME) ? { executablePath: LOCAL_CHROME } : undefined;

// Browser-mode Vitest project for the QD app — the ONLY place the real app BOOT is exercised.
// The QD app is a WebGL2 canvas app that BOOTS ON IMPORT against the DOM; jsdom cannot provide a
// WebGL2 context, so its boot path (main.mjs → the module graph → ui/ui.mjs's bootQdUi()) had ZERO
// executable coverage (register findings QD-UI-5, QD-TEST-2) — the build only *bundles* it. This
// mirrors apps/complex-dynamics/vitest.browser.config.ts: same Playwright/Chromium provider, and it
// is deliberately NOT registered in vitest.workspace.ts, so the default `pnpm test` gate never
// launches a browser. Run via `pnpm test:browser` from the repo root (which now also runs this) or
// from this package. CI's existing `browser` job already installs Chromium — this reuses it.
//
// Scope: `include` is narrowed to vitest/browser/*.browser.test.ts so the app's large node suite
// (vitest/**/*.test.ts + the wrapped node-suite) stays on the main gate, untouched.
export default defineConfig({
  // Pre-bundle the app's two heavy vendored deps so Vite does not discover + optimize them mid-run
  // and reload the test (which prints an "unexpectedly reloaded" warning and risks flaky/double runs).
  // katex is imported eagerly by core/vendor-globals.mjs; mathjs is its lazy chunk, pulled during boot.
  optimizeDeps: { include: ["katex", "mathjs"] },
  test: {
    name: "quadrature-domains-browser",
    include: ["vitest/browser/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      providerOptions: { launch },
    },
  },
});
