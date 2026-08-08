import { defineConfig, configDefaults } from "vitest/config";

// @cas/schwarz tests (test/**). Registered in the root vitest.workspace.ts. Pure numeric σ
// reconstruction (Newton + Durand–Kerner over @cas/core), so the node environment suffices. The GPU σ
// *numeric* parity harness (runSigmaGLSL) needs a real WebGL2 context and lives in `*.browser.test.ts`,
// run by the SEPARATE vitest.browser.config.ts (`pnpm test:browser`) — excluded here so the node gate
// never tries to launch a browser (mirrors packages/gpu/vitest.config.ts; S4b).
export default defineConfig({
  test: {
    name: "schwarz",
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/**/*.browser.test.ts"],
  },
});
