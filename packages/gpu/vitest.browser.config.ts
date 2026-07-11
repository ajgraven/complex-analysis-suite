import { defineConfig } from "vitest/config";

// SEPARATE browser-mode Vitest project for the dual-backend GLSL≈JS *numeric* harness (Review P4:
// GLSL-in-CI). It is NOT registered in vitest.workspace.ts, so the default `pnpm test` gate never
// touches a browser; run it explicitly with `pnpm test:browser` (from this package or the repo root).
//
// `runGLSL` (src/dualBackend.ts) compiles the @cas/expr → GLSL shader, renders each (z,c) sample to a
// 1×1 RGBA32F target in a REAL WebGL2 context, and reads it back — the only way to catch float32 GLSL
// drift that the CPU-mirror tests cannot (the H1/H2/H3 class). It needs a live WebGL2 context, hence a
// browser. Setup once per machine/CI: `npx playwright install chromium` (the browser binary is NOT
// downloaded by `pnpm install` — pnpm skips playwright's postinstall). Headless Chromium renders WebGL2
// via SwiftShader, including the EXT_color_buffer_float readback the harness needs.
export default defineConfig({
  test: {
    name: "gpu-browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
    },
  },
});
