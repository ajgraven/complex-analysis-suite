import { defineConfig } from "vitest/config";

// SEPARATE browser-mode Vitest project for the GPU σ *numeric* parity harness (S4b). NOT registered in
// vitest.workspace.ts, so the default `pnpm test` gate never launches a browser; run it with
// `pnpm test:browser` (from this package or the repo root). Mirrors packages/gpu/vitest.browser.config.ts.
//
// runSigmaGLSL (src/gpu/probe.ts) compiles the lifted σ shader, uploads φ, and reads σ(w) back from a
// 1×1 RGBA32F target in a REAL WebGL2 context — the only way to prove the float32 GLSL agrees with the
// CPU engine (makeUnboundedLaurentSchwarz). It needs a live WebGL2 context, hence a browser. Setup once
// per machine/CI: `npx playwright install chromium` (pnpm skips playwright's postinstall). Headless
// Chromium renders WebGL2 via SwiftShader, including the EXT_color_buffer_float readback the harness needs.
export default defineConfig({
  test: {
    name: "schwarz-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
    },
  },
});
